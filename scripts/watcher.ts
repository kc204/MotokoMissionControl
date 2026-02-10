import { exec } from "child_process";
import { promisify } from "util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadMissionControlEnv } from "./lib/mission-control";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  console.error("Missing NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const execAsync = promisify(exec);

const POLL_MS = Number(process.env.WATCHER_POLL_MS || 3000);
const MODELS_SYNC_MS = Number(process.env.WATCHER_MODELS_SYNC_MS || 15000);
const AUTH_SYNC_MS = Number(process.env.WATCHER_AUTH_SYNC_MS || 15000);
const IDENTITY_SYNC_MS = Number(process.env.WATCHER_IDENTITY_SYNC_MS || 8000);
const RETRY_BASE_MS = Number(process.env.WATCHER_RETRY_BASE_MS || 60000);
const RETRY_MAX_MS = Number(process.env.WATCHER_RETRY_MAX_MS || 600000);
const HISTORY_TTL_MS = Number(process.env.WATCHER_HISTORY_TTL_MS || 3600000);
const OPENCLAW_WORKSPACE_ROOT =
  process.env.OPENCLAW_WORKSPACE_ROOT || path.join(os.homedir(), ".openclaw", "workspace");

const AGENT_ID_MAP: Record<string, string> = {
  Motoko: "motoko",
  Recon: "researcher",
  Quill: "writer",
  Forge: "developer",
  Pulse: "monitor",
};
const WATCHER_AGENT_IDS = Array.from(new Set(Object.values(AGENT_ID_MAP)));

const state = {
  models: new Map<string, string>(),
  authProfile: null as string | null,
  lastSeenMessageId: null as string | null,
  inFlightMessageId: null as string | null,
  processedAt: new Map<string, number>(),
  failureCount: new Map<string, number>(),
  retryAt: new Map<string, number>(),
  lastModelsSyncAt: 0,
  lastAuthSyncAt: 0,
  identityByAgent: new Map<string, string>(),
  lastIdentitySyncAt: 0,
};

function normalizeModelName(modelName?: string) {
  if (!modelName) return "";
  const trimmed = modelName.trim();
  if (trimmed === "anthropic/codex-cli") return "codex-cli";
  return trimmed;
}

function isAvailableModel(modelId: string, catalog: Set<string>) {
  if (!modelId || catalog.size === 0) return true;
  if (catalog.has(modelId)) return true;
  for (const id of catalog) {
    if (id.endsWith(`/${modelId}`)) return true;
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneHistory(now: number) {
  for (const [messageId, at] of state.processedAt) {
    if (now - at > HISTORY_TTL_MS) {
      state.processedAt.delete(messageId);
      state.failureCount.delete(messageId);
      state.retryAt.delete(messageId);
    }
  }
}

async function findAgentIndex(agentId: string): Promise<number> {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const content = await fs.readFile(configPath, "utf-8");
    const json = JSON.parse(content);
    const list = Array.isArray(json?.agents?.list) ? json.agents.list : [];
    return list.findIndex((entry: { id?: unknown }) => entry?.id === agentId);
  } catch {
    return -1;
  }
}

async function getConfiguredOpenClawAgentIds(): Promise<Set<string>> {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const content = await fs.readFile(configPath, "utf-8");
    const json = JSON.parse(content);
    const list = Array.isArray(json?.agents?.list) ? json.agents.list : [];
    return new Set(
      list
        .map((entry: { id?: unknown }) =>
          typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : null
        )
        .filter((id: string | null): id is string => Boolean(id))
    );
  } catch {
    return new Set<string>();
  }
}

async function getConfiguredOpenClawAgents(): Promise<
  Array<{ id: string; workspace?: string | null }>
> {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const content = await fs.readFile(configPath, "utf-8");
    const json = JSON.parse(content);
    const list = Array.isArray(json?.agents?.list) ? json.agents.list : [];
    return list
      .map((entry: { id?: unknown; workspace?: unknown }) => {
        const id = typeof entry?.id === "string" ? entry.id.trim() : "";
        const workspace =
          typeof entry?.workspace === "string" && entry.workspace.trim()
            ? entry.workspace.trim()
            : null;
        return id ? { id, workspace } : null;
      })
      .filter((entry: { id: string; workspace?: string | null } | null): entry is {
        id: string;
        workspace?: string | null;
      } => Boolean(entry));
  } catch {
    return [];
  }
}

function buildIdentityContent(agent: {
  name: string;
  role: string;
  level?: string;
  systemPrompt?: string;
  character?: string;
  lore?: string;
}) {
  const role = agent.role?.trim() || "Agent";
  const level = agent.level?.trim() || "SPC";
  const systemPrompt = agent.systemPrompt?.trim() || "";
  const character = agent.character?.trim() || "";
  const lore = agent.lore?.trim() || "";

  const lines = [
    `# Identity: ${agent.name}`,
    "",
    `## Role`,
    `${role} (${level})`,
    "",
    `## System Prompt`,
    systemPrompt || "Not specified.",
    "",
    `## Character`,
    character || "Not specified.",
    "",
    `## Lore`,
    lore || "Not specified.",
    "",
    `## Behavioral Contract`,
    "- Follow user instructions exactly.",
    "- Keep responses concise and actionable.",
    "- Ask for clarification when requirements are ambiguous.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function defaultWorkspaceForAgentId(agentId: string) {
  if (agentId === "main") return OPENCLAW_WORKSPACE_ROOT;
  return path.join(OPENCLAW_WORKSPACE_ROOT, agentId);
}

async function syncIdentity(now: number) {
  if (now - state.lastIdentitySyncAt < IDENTITY_SYNC_MS) return;
  state.lastIdentitySyncAt = now;

  const [agents, configuredAgents] = await Promise.all([
    client.query(api.agents.list),
    getConfiguredOpenClawAgents(),
  ]);
  const configuredById = new Map(configuredAgents.map((entry) => [entry.id, entry]));

  for (const agent of agents) {
    const openclawId = AGENT_ID_MAP[agent.name];
    if (!openclawId) continue;

    const identityContent = buildIdentityContent(agent);
    const prev = state.identityByAgent.get(agent.name);
    if (prev === identityContent) continue;

    const configured = configuredById.get(openclawId);
    const workspaceRoot = configured?.workspace || defaultWorkspaceForAgentId(openclawId);
    const identityPath = path.join(workspaceRoot, "IDENTITY.md");

    try {
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(identityPath, identityContent, "utf-8");
      state.identityByAgent.set(agent.name, identityContent);
      console.log(`[identity-sync] ${agent.name} (${openclawId}) -> ${identityPath}`);
    } catch (error) {
      console.error(`[identity-sync] failed for ${agent.name}:`, error);
    }
  }
}

async function syncModels(now: number) {
  if (now - state.lastModelsSyncAt < MODELS_SYNC_MS) return;
  state.lastModelsSyncAt = now;

  const [agents, availableModels] = await Promise.all([
    client.query(api.agents.list),
    client.query(api.models.list).catch(() => [] as Array<{ id: string; name: string }>),
  ]);
  const catalog = new Set(availableModels.map((m) => normalizeModelName(m.id)));

  for (const agent of agents) {
    const openclawId = AGENT_ID_MAP[agent.name];
    if (!openclawId) continue;

    const desiredRaw = agent.models?.thinking || "";
    const desiredModel = normalizeModelName(desiredRaw);
    const previous = state.models.get(agent.name);

    if (!previous) {
      state.models.set(agent.name, desiredModel);
      continue;
    }
    if (previous === desiredModel) continue;

    if (!isAvailableModel(desiredModel, catalog)) {
      console.warn(
        `[model-preflight] ${agent.name} (${openclawId}) unavailable model(s): thinking=${desiredModel}`
      );
      state.models.set(agent.name, desiredModel);
      continue;
    }

    try {
      if (openclawId === "main") {
        await execAsync(`openclaw config set agents.defaults.model.primary "${desiredModel}"`);
      } else {
        const index = await findAgentIndex(openclawId);
        if (index < 0) {
          console.warn(`[model-sync] could not find OpenClaw agent id "${openclawId}" in config`);
          state.models.set(agent.name, desiredModel);
          continue;
        }
        await execAsync(`openclaw config set agents.list[${index}].model "${desiredModel}"`);
      }
      console.log(`[model-sync] ${agent.name} (${openclawId}) -> ${desiredModel}`);
    } catch (error) {
      console.error(`[model-sync] failed for ${agent.name}:`, error);
    } finally {
      state.models.set(agent.name, desiredModel);
    }
  }
}

async function syncAuth(now: number) {
  if (now - state.lastAuthSyncAt < AUTH_SYNC_MS) return;
  state.lastAuthSyncAt = now;

  const activeProfile = await client.query(api.auth.getActive).catch(() => null);
  if (!activeProfile?.profileId) return;
  if (state.authProfile === activeProfile.profileId) return;

  try {
    const provider = activeProfile.profileId.split(":")[0];
    if (!provider) {
      throw new Error(`Invalid profile id format: ${activeProfile.profileId}`);
    }
    const configured = await getConfiguredOpenClawAgentIds();
    const targetIds = WATCHER_AGENT_IDS.filter((id) => configured.has(id));

    if (targetIds.length === 0) {
      await execAsync(
        `openclaw models auth order set --provider "${provider}" "${activeProfile.profileId}"`
      );
      console.log(`[auth-sync] set auth profile (default scope) -> ${activeProfile.profileId}`);
      state.authProfile = activeProfile.profileId;
      return;
    }

    for (const agentId of targetIds) {
      await execAsync(
        `openclaw models auth order set --agent "${agentId}" --provider "${provider}" "${activeProfile.profileId}"`
      );
    }
    if (WATCHER_AGENT_IDS.includes("main")) {
      // Also apply default-scope auth order for the implicit main agent.
      await execAsync(
        `openclaw models auth order set --provider "${provider}" "${activeProfile.profileId}"`
      );
    }
    console.log(
      `[auth-sync] set auth profile for agents [${targetIds.join(", ")}] -> ${activeProfile.profileId}`
    );
    state.authProfile = activeProfile.profileId;
  } catch (error) {
    console.error("[auth-sync] switch failed:", error);
  }
}

async function runOrchestrator(messageId: string) {
  state.inFlightMessageId = messageId;
  state.lastSeenMessageId = messageId;
  try {
    const { stdout, stderr } = await execAsync("npx tsx scripts/orchestrator.ts");
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.warn(stderr.trim());
    state.processedAt.set(messageId, Date.now());
    state.failureCount.delete(messageId);
    state.retryAt.delete(messageId);
  } catch (error) {
    const failures = (state.failureCount.get(messageId) ?? 0) + 1;
    const delay = Math.min(RETRY_BASE_MS * failures, RETRY_MAX_MS);
    state.failureCount.set(messageId, failures);
    state.retryAt.set(messageId, Date.now() + delay);
    console.error(`[dispatch] orchestrator failed for ${messageId}; retry in ${delay}ms`, error);
  } finally {
    state.inFlightMessageId = null;
  }
}

async function checkChat(now: number) {
  if (state.inFlightMessageId) return;

  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;

  const newest = messages[messages.length - 1];
  if (!newest?._id) return;

  // Agent-originated messages do not trigger orchestration.
  if (newest.agentId) {
    state.lastSeenMessageId = newest._id;
    return;
  }

  const messageId = newest._id as string;
  const retryAt = state.retryAt.get(messageId) ?? 0;
  if (retryAt > now) return;
  if (state.processedAt.has(messageId)) return;

  // Only launch when we observe a new user message.
  if (state.lastSeenMessageId && state.lastSeenMessageId !== messageId) {
    console.log(`[dispatch] new HQ user message ${messageId}`);
  } else if (state.lastSeenMessageId === messageId && !state.failureCount.has(messageId)) {
    return;
  }

  await runOrchestrator(messageId);
}

async function main() {
  console.log(`Watcher active. poll=${POLL_MS}ms`);
  while (true) {
    const now = Date.now();
    try {
      await syncModels(now);
      await syncAuth(now);
      await syncIdentity(now);
      await checkChat(now);
      pruneHistory(now);
    } catch (error) {
      console.error("[watcher] loop error:", error);
    }
    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error("Watcher fatal:", error);
  process.exit(1);
});
