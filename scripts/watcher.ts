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
const RETRY_BASE_MS = Number(process.env.WATCHER_RETRY_BASE_MS || 60000);
const RETRY_MAX_MS = Number(process.env.WATCHER_RETRY_MAX_MS || 600000);
const HISTORY_TTL_MS = Number(process.env.WATCHER_HISTORY_TTL_MS || 3600000);

const AGENT_ID_MAP: Record<string, string> = {
  Motoko: "main",
  Recon: "researcher",
  Quill: "writer",
  Forge: "developer",
  Pulse: "monitor",
};

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

    const index = await findAgentIndex(openclawId);
    if (index < 0) {
      console.warn(`[model-sync] could not find OpenClaw agent id "${openclawId}" in config`);
      state.models.set(agent.name, desiredModel);
      continue;
    }

    try {
      await execAsync(`openclaw config set agents.list[${index}].model "${desiredModel}"`);
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
  if (!state.authProfile) {
    state.authProfile = activeProfile.profileId;
    return;
  }
  if (state.authProfile === activeProfile.profileId) return;

  try {
    const provider = activeProfile.profileId.split(":")[0];
    if (!provider) {
      throw new Error(`Invalid profile id format: ${activeProfile.profileId}`);
    }
    await execAsync(
      `openclaw models auth order set --provider "${provider}" "${activeProfile.profileId}"`
    );
    console.log(`[auth-sync] set auth profile -> ${activeProfile.profileId}`);
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
