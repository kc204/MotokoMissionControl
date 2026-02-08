import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import os from "os";
import path from "path";
import {
  buildTsxCommand,
  loadMissionControlEnv,
  normalizeModelId,
  parseOpenClawJsonOutput,
  resolveMissionControlRoot,
  resolveScriptPath,
} from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const POLL_MS = Number(process.env.WATCHER_POLL_MS || 1000);
const MODEL_SYNC_MS = Number(process.env.WATCHER_MODEL_SYNC_MS || 5000);
const AUTH_PROFILE_DISCOVERY_MS = Number(process.env.WATCHER_AUTH_PROFILE_DISCOVERY_MS || 15000);
const AUTOMATION_REFRESH_MS = Number(process.env.AUTOMATION_REFRESH_MS || 5000);
const WATCHER_LEASE_KEY = "watcher:leader";
const WATCHER_LAST_SEEN_USER_MESSAGE_KEY = "watcher:last_seen_hq_user_message_id";
const WATCHER_LEASE_TTL_MS = Number(process.env.WATCHER_LEASE_TTL_MS || 8000);
const WATCHER_LEASE_RENEW_MS = Number(
  process.env.WATCHER_LEASE_RENEW_MS || Math.max(1000, Math.floor(WATCHER_LEASE_TTL_MS / 2))
);
const MANUAL_DISPATCH_KEY = "orchestrator:manual_dispatch";
const LAST_DISPATCH_RESULT_KEY = "probe:last_dispatch_result";
const TASK_HQ_COLLAB_ENABLED = process.env.TASK_HQ_COLLAB_ENABLED !== "false";
const WATCHER_FAILOVER_ENABLED = process.env.WATCHER_FAILOVER_ENABLED !== "false";
const parsedTaskHqMinSpecialists = Number(process.env.TASK_HQ_COLLAB_MIN_SPECIALISTS || 2);
const TASK_HQ_COLLAB_MIN_SPECIALISTS = Number.isFinite(parsedTaskHqMinSpecialists)
  ? Math.max(1, Math.floor(parsedTaskHqMinSpecialists))
  : 2;
const parsedTaskHqSpecialistCount = Number(process.env.TASK_HQ_COLLAB_MAX_SPECIALISTS || 2);
const TASK_HQ_COLLAB_MAX_SPECIALISTS = Number.isFinite(parsedTaskHqSpecialistCount)
  ? Math.max(TASK_HQ_COLLAB_MIN_SPECIALISTS, Math.floor(parsedTaskHqSpecialistCount))
  : Math.max(TASK_HQ_COLLAB_MIN_SPECIALISTS, 2);
const missionControlRoot = resolveMissionControlRoot();
const tsxCliPath = path.join(missionControlRoot, "node_modules", "tsx", "dist", "cli.mjs");
const orchestratorScriptPath = resolveScriptPath("orchestrator.ts");
const reportScriptPath = buildTsxCommand("report.ts");
const OPENCLAW_AUTH_PROFILES_PATH =
  process.env.OPENCLAW_AUTH_PROFILES_PATH ||
  path.join(os.homedir(), ".openclaw", "agents", "main", "agent", "auth-profiles.json");
const watcherInstanceId = `${os.hostname()}:${process.pid}`;

const client = new ConvexHttpClient(convexUrl);
const modelCache = new Map<string, string>();
const authProfileCacheByAgent = new Map<string, string>();
let orchestratorBusy = false;
let isLeader = false;
let lastLeaseCheckAt = 0;
let lastModelSyncAt = 0;
let lastAuthProfileDiscoveryAt = 0;
let lastSeenUserMessageId: string | null = null;
let hasLoadedLastSeenUserMessageId = false;
let lastManualDispatchToken: string | null = null;
let lastAutomationRefreshAt = 0;
let autoDispatchEnabled = true;
let authProfileDiscoverySignature: string | null = null;

function spawnOpenClaw(args: string[]) {
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", OPENCLAW_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(OPENCLAW_BIN, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
}

function terminateOpenClawProcess(child: ReturnType<typeof spawnOpenClaw>) {
  if (IS_WINDOWS && child.pid) {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
    killer.on("error", () => {
      try {
        child.kill();
      } catch {
        // Best-effort process cleanup.
      }
    });
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // Best-effort process cleanup.
  }
}

async function runOpenClaw(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `openclaw exited with code ${code}`));
    });
  });
}

async function runOpenClawJson<T>(
  args: string[],
  options?: {
    shouldCancel?: () => Promise<boolean>;
    cancelCheckMs?: number;
  }
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let settled = false;
    const cancelCheckMs = Math.max(250, options?.cancelCheckMs ?? 750);
    const cancelInterval =
      options?.shouldCancel &&
      setInterval(async () => {
        if (settled || cancelled) return;
        try {
          const shouldCancel = await options.shouldCancel?.();
          if (!shouldCancel) return;
          cancelled = true;
          terminateOpenClawProcess(child);
        } catch {
          // Ignore transient cancellation-check failures.
        }
      }, cancelCheckMs);

    const cleanup = () => {
      if (cancelInterval) {
        clearInterval(cancelInterval);
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (cancelled) {
        reject(new Error("Dispatch cancelled"));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || `openclaw exited with code ${code}`));
        return;
      }
      try {
        resolve(parseOpenClawJsonOutput<T>(stdout));
      } catch {
        reject(new Error(`Failed to parse JSON from openclaw: ${stdout || stderr}`));
      }
    });
  });
}

async function refreshAutomationConfig(now: number) {
  if (now - lastAutomationRefreshAt < AUTOMATION_REFRESH_MS) return;
  lastAutomationRefreshAt = now;
  try {
    const config = await client.query(api.settings.getAutomationConfig);
    autoDispatchEnabled = config.autoDispatchEnabled;
  } catch (error) {
    console.error("[automation] failed to load config, using previous values:", error);
  }
}

async function ensureLeadership(now: number) {
  if (now - lastLeaseCheckAt < WATCHER_LEASE_RENEW_MS) return isLeader;
  lastLeaseCheckAt = now;
  try {
    const lease = await client.mutation(api.settings.acquireLease, {
      key: WATCHER_LEASE_KEY,
      owner: watcherInstanceId,
      ttlMs: WATCHER_LEASE_TTL_MS,
    });
    const nextLeader = lease.acquired;
    if (nextLeader !== isLeader) {
      console.log(
        nextLeader
          ? `[leader] acquired by ${watcherInstanceId}`
          : `[leader] standby; active owner=${lease.owner ?? "unknown"}`
      );
    }
    isLeader = nextLeader;
  } catch (error) {
    if (isLeader) {
      console.error("[leader] lease renewal failed, entering standby:", error);
    }
    isLeader = false;
  }
  return isLeader;
}

async function releaseLeadership() {
  if (!isLeader) return;
  try {
    await client.mutation(api.settings.releaseLease, {
      key: WATCHER_LEASE_KEY,
      owner: watcherInstanceId,
    });
  } catch (error) {
    console.error("[leader] release failed:", error);
  }
}

async function loadLastSeenUserMessageId() {
  if (hasLoadedLastSeenUserMessageId) return;
  hasLoadedLastSeenUserMessageId = true;
  try {
    const row = await client.query(api.settings.get, { key: WATCHER_LAST_SEEN_USER_MESSAGE_KEY });
    lastSeenUserMessageId = typeof row?.value === "string" ? row.value : null;
  } catch (error) {
    console.error("[dispatch] failed to load persisted dedupe pointer:", error);
    lastSeenUserMessageId = null;
  }
}

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return "main";
}

async function syncModels() {
  const configAgents = await runOpenClawJson<Array<{ id?: string }>>([
    "config",
    "get",
    "agents.list",
    "--json",
  ]).catch(() => []);
  const configList = Array.isArray(configAgents) ? configAgents : [];
  const modelPathByAgentId = new Map<string, string>();
  for (let i = 0; i < configList.length; i += 1) {
    const id = configList[i]?.id;
    if (typeof id !== "string" || !id) continue;
    modelPathByAgentId.set(id, `agents.list[${i}].model`);
  }

  const agents = await client.query(api.agents.list);
  for (const agent of agents) {
    const key = agent.sessionKey;
    const desired = normalizeModelId(agent.models.thinking);
    if (!desired) continue;
    const lastKnown = modelCache.get(key);
    if (lastKnown === desired) continue;

    const openclawAgentId = agentIdFromSessionKey(agent.sessionKey);
    const modelPath = modelPathByAgentId.get(openclawAgentId);
    let configPersisted = false;

    try {
      if (modelPath) {
        await runOpenClaw(["config", "set", modelPath, desired]);
        configPersisted = true;
      } else {
        console.warn(`[model] config path missing for ${agent.name} (${openclawAgentId}), applying runtime only`);
      }

      // Also apply through models command for immediate runtime alignment.
      await runOpenClaw(["models", "--agent", openclawAgentId, "set", desired]);
      modelCache.set(key, desired);
      console.log(
        `[model] ${agent.name} (${openclawAgentId}) -> ${desired} persisted=${configPersisted}`
      );
    } catch (error) {
      console.error(`[model] failed for ${agent.name}:`, error);
    }
  }
}

type OpenClawAuthProfileValue = {
  provider?: string;
  email?: string;
};

type OpenClawAuthFile = {
  profiles?: Record<string, OpenClawAuthProfileValue>;
};

type ActiveAuthProfile = {
  provider: string;
  profileId: string;
};

type AuthProfileCandidate = ActiveAuthProfile;

type DispatchThreadMessage = {
  fromUser: boolean;
  text: string;
};

type AgentRecord = {
  _id: Id<"agents">;
  name: string;
  role: string;
  level?: "LEAD" | "INT" | "SPC";
  sessionKey: string;
  systemPrompt?: string;
  character?: string;
  lore?: string;
  models: {
    thinking: string;
    execution?: string;
    heartbeat: string;
    fallback: string;
  };
};

type MessageRecord = {
  _id: Id<"messages">;
  text?: string;
  content?: string;
  agentId?: Id<"agents">;
};

type ClaimedTaskDispatch = {
  dispatchId: Id<"taskDispatches">;
  taskId: Id<"tasks">;
  taskTitle: string;
  taskDescription: string;
  taskPriority: "low" | "medium" | "high" | "urgent";
  taskTags: string[];
  targetAgentId: Id<"agents">;
  targetAgentName: string;
  targetSessionKey: string;
  targetThinkingModel: string;
  targetFallbackModel: string;
  targetAgentLevel: "LEAD" | "INT" | "SPC";
  targetAgentRole: string;
  targetAgentSystemPrompt: string;
  targetAgentCharacter: string;
  targetAgentLore: string;
  prompt: string;
  threadMessages: DispatchThreadMessage[];
};

function parseProfileId(profileId: string): { provider: string; email: string } {
  const separator = profileId.indexOf(":");
  if (separator === -1) {
    return { provider: "", email: profileId };
  }
  return {
    provider: profileId.slice(0, separator),
    email: profileId.slice(separator + 1),
  };
}

async function syncAuthProfilesFromOpenClaw() {
  try {
    const raw = await readFile(OPENCLAW_AUTH_PROFILES_PATH, "utf8");
    const parsed = JSON.parse(raw) as OpenClawAuthFile;
    const entries = Object.entries(parsed.profiles ?? {});
    if (entries.length === 0) return;

    const profiles = entries
      .map(([profileId, value]) => {
        const parsedId = parseProfileId(profileId);
        const provider =
          typeof value?.provider === "string" && value.provider
            ? value.provider
            : parsedId.provider;
        const email =
          typeof value?.email === "string" && value.email
            ? value.email
            : parsedId.email;
        if (!provider || !profileId) return null;
        return { profileId, provider, email };
      })
      .filter((item): item is { profileId: string; provider: string; email: string } => !!item)
      .sort((a, b) => a.profileId.localeCompare(b.profileId));

    if (profiles.length === 0) return;

    const signature = JSON.stringify(profiles);
    if (signature === authProfileDiscoverySignature) return;

    await client.mutation(api.auth.syncProfiles, { profiles });
    authProfileDiscoverySignature = signature;
    console.log(
      `[auth] discovered ${profiles.length} OpenClaw profiles from ${OPENCLAW_AUTH_PROFILES_PATH}`
    );
  } catch (error) {
    console.error("[auth] profile discovery failed:", error);
  }
}

async function syncAuthProfile() {
  const active = await client.query(api.auth.getActive);
  if (!active) return;
  const provider =
    (typeof active.provider === "string" && active.provider) ||
    active.profileId.split(":")[0] ||
    "";
  if (!provider) {
    console.error(`[auth] unable to determine provider for profile ${active.profileId}`);
    return;
  }

  const agents = await client.query(api.agents.list);
  const syncKey = `${provider}:${active.profileId}`;
  let successCount = 0;
  let attemptedCount = 0;

  for (const agent of agents) {
    const runtimeAgentId = agentIdFromSessionKey(agent.sessionKey);
    if (authProfileCacheByAgent.get(runtimeAgentId) === syncKey) {
      continue;
    }

    attemptedCount += 1;
    try {
      await runOpenClaw([
        "models",
        "auth",
        "order",
        "set",
        "--provider",
        provider,
        "--agent",
        runtimeAgentId,
        active.profileId,
      ]);
      authProfileCacheByAgent.set(runtimeAgentId, syncKey);
      successCount += 1;
    } catch (error) {
      authProfileCacheByAgent.delete(runtimeAgentId);
      console.error(`[auth] failed for ${agent.name}:`, error);
    }
  }

  if (attemptedCount > 0) {
    console.log(
      `[auth] active profile ${active.profileId} provider=${provider} synced=${successCount}/${attemptedCount} (remaining retry=${attemptedCount - successCount})`
    );
  }
}

async function getActiveAuthProfile(): Promise<ActiveAuthProfile | null> {
  const active = await client.query(api.auth.getActive);
  if (!active) return null;
  const provider =
    (typeof active.provider === "string" && active.provider) ||
    active.profileId.split(":")[0] ||
    "";
  if (!provider) return null;
  return { provider, profileId: active.profileId };
}

async function getAuthProfileCandidates(
  preferred: ActiveAuthProfile | null
): Promise<Array<AuthProfileCandidate | null>> {
  const profiles = await client.query(api.auth.list);
  const normalized = profiles
    .map((profile) => {
      const provider =
        (typeof profile.provider === "string" && profile.provider) ||
        profile.profileId.split(":")[0] ||
        "";
      if (!provider || !profile.profileId) return null;
      return {
        provider,
        profileId: profile.profileId,
        isActive: !!profile.isActive,
      };
    })
    .filter((profile): profile is AuthProfileCandidate & { isActive: boolean } => !!profile)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));

  const deduped: AuthProfileCandidate[] = [];
  const seen = new Set<string>();
  const preferredKey = preferred ? `${preferred.provider}:${preferred.profileId}` : "";
  if (preferred && !seen.has(preferred.profileId)) {
    deduped.push(preferred);
    seen.add(preferred.profileId);
  }

  for (const profile of normalized) {
    if (seen.has(profile.profileId)) continue;
    const key = `${profile.provider}:${profile.profileId}`;
    if (preferredKey && key === preferredKey) continue;
    deduped.push({ provider: profile.provider, profileId: profile.profileId });
    seen.add(profile.profileId);
  }

  return deduped.length > 0 ? deduped : [null];
}

async function ensureAgentAuthOrder(runtimeAgentId: string, auth: ActiveAuthProfile | null) {
  if (!auth) return;
  const syncKey = `${auth.provider}:${auth.profileId}`;
  if (authProfileCacheByAgent.get(runtimeAgentId) === syncKey) return;

  await runOpenClaw([
    "models",
    "auth",
    "order",
    "set",
    "--provider",
    auth.provider,
    "--agent",
    runtimeAgentId,
    auth.profileId,
  ]);
  authProfileCacheByAgent.set(runtimeAgentId, syncKey);
}

function isQuotaLikeError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("capacity") ||
    lower.includes("rate limit") ||
    lower.includes("exhausted")
  );
}

async function runOpenClawAgentWithFailover(args: {
  dispatchId: Id<"taskDispatches">;
  runtimeAgentId: string;
  sessionId: string;
  prompt: string;
  primaryModel: string;
  fallbackModel?: string;
  modelCacheKey: string;
  preferredAuthProfile: ActiveAuthProfile | null;
}) {
  const modelCandidates = [
    normalizeModelId(args.primaryModel),
    WATCHER_FAILOVER_ENABLED ? normalizeModelId(args.fallbackModel ?? "") : "",
  ].filter((model, index, all) => !!model && all.indexOf(model) === index);

  const authCandidates = WATCHER_FAILOVER_ENABLED
    ? await getAuthProfileCandidates(args.preferredAuthProfile)
    : [args.preferredAuthProfile ?? null];

  const attempts: Array<{ model: string; auth: ActiveAuthProfile | null }> = [];
  for (const model of modelCandidates) {
    for (const auth of authCandidates) {
      attempts.push({ model, auth });
    }
  }
  if (attempts.length === 0) {
    attempts.push({
      model: normalizeModelId(args.primaryModel) || args.primaryModel,
      auth: args.preferredAuthProfile,
    });
  }

  let lastError: Error | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    const hasMoreAttempts = i < attempts.length - 1;

    try {
      await ensureAgentAuthOrder(args.runtimeAgentId, attempt.auth);
      if (attempt.model && modelCache.get(args.modelCacheKey) !== attempt.model) {
        await runOpenClaw(["models", "--agent", args.runtimeAgentId, "set", attempt.model]);
        modelCache.set(args.modelCacheKey, attempt.model);
      }

      return await runOpenClawJson<unknown>([
        "agent",
        "--agent",
        args.runtimeAgentId,
        "--session-id",
        args.sessionId,
        "--message",
        args.prompt,
        "--json",
      ], {
        shouldCancel: async () =>
          await client.query(api.tasks.shouldCancelDispatch, {
            dispatchId: args.dispatchId,
          }),
        cancelCheckMs: 750,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === "Dispatch cancelled") {
        throw new Error(errorMessage);
      }
      lastError = error instanceof Error ? error : new Error(errorMessage);
      if (WATCHER_FAILOVER_ENABLED && isQuotaLikeError(errorMessage) && hasMoreAttempts) {
        console.warn(
          `[dispatch_failover] dispatchId=${args.dispatchId} runtimeAgent=${args.runtimeAgentId} model=${
            attempt.model || "-"
          } auth=${attempt.auth?.profileId ?? "-"} reason=${errorMessage}`
        );
        continue;
      }
      throw lastError;
    }
  }

  if (lastError) throw lastError;
  throw new Error("OpenClaw run failed without captured error");
}

function extractAssistantText(payload: unknown): string {
  const data = payload as
    | {
        result?: { payloads?: Array<{ text?: string | null }> };
      }
    | undefined;
  const payloads = data?.result?.payloads;
  if (!Array.isArray(payloads)) return "";
  const parts = payloads
    .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
    .filter(Boolean);
  return parts.join("\n\n").trim();
}

function extractRunId(payload: unknown): string | undefined {
  const data = payload as
    | {
        runId?: string;
        result?: { runId?: string; meta?: { runId?: string } };
        meta?: { runId?: string };
      }
    | undefined;
  const candidates = [
    data?.runId,
    data?.result?.runId,
    data?.result?.meta?.runId,
    data?.meta?.runId,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim();
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function levelLabel(level?: "LEAD" | "INT" | "SPC") {
  if (level === "LEAD") return "Lead";
  if (level === "INT") return "Integrator";
  if (level === "SPC") return "Specialist";
  return "Specialist";
}

function buildPersonaBlock(agent: AgentRecord) {
  const lines = [`${agent.name} Role: ${agent.role} (${levelLabel(agent.level)})`];
  if (agent.systemPrompt?.trim()) lines.push(`System Prompt: ${cleanText(agent.systemPrompt)}`);
  if (agent.character?.trim()) lines.push(`Character: ${cleanText(agent.character)}`);
  if (agent.lore?.trim()) lines.push(`Lore: ${cleanText(agent.lore)}`);
  return lines.join("\n");
}

function pickLeadAgent(agents: AgentRecord[], fallback: AgentRecord | null) {
  return (
    agents.find((agent) => agent.name === "Motoko") ??
    agents.find((agent) => agent.level === "LEAD") ??
    fallback
  );
}

function pickTaskSpecialists(args: {
  dispatch: ClaimedTaskDispatch;
  agents: AgentRecord[];
  lead: AgentRecord;
  target: AgentRecord | null;
}) {
  const selected: AgentRecord[] = [];
  const byName = new Map(args.agents.map((agent) => [agent.name, agent]));

  if (args.target && args.target._id !== args.lead._id) {
    selected.push(args.target);
  }

  const lowerText = `${args.dispatch.taskTitle}\n${args.dispatch.taskDescription}\n${args.dispatch.taskTags.join(" ")}`
    .toLowerCase();
  const rules: Array<{ name: string; keywords: string[] }> = [
    { name: "Recon", keywords: ["research", "source", "investigate", "find", "competitor"] },
    { name: "Forge", keywords: ["code", "build", "deploy", "fix", "bug", "refactor"] },
    { name: "Quill", keywords: ["write", "copy", "docs", "document", "content"] },
    { name: "Pulse", keywords: ["metrics", "analytics", "monitor", "performance", "kpi"] },
  ];

  for (const rule of rules) {
    if (!rule.keywords.some((keyword) => lowerText.includes(keyword))) continue;
    const agent = byName.get(rule.name);
    if (!agent || agent._id === args.lead._id) continue;
    if (!selected.some((item) => item._id === agent._id)) selected.push(agent);
  }

  const fallbackOrder = ["Forge", "Recon", "Quill", "Pulse"]
    .map((name) => byName.get(name))
    .filter((agent): agent is AgentRecord => !!agent && agent._id !== args.lead._id);
  for (const fallback of fallbackOrder) {
    if (selected.some((item) => item._id === fallback._id)) continue;
    selected.push(fallback);
    if (selected.length >= TASK_HQ_COLLAB_MAX_SPECIALISTS) break;
  }

  const minimumSpecialists = Math.min(TASK_HQ_COLLAB_MIN_SPECIALISTS, fallbackOrder.length || selected.length);
  if (selected.length < minimumSpecialists) {
    for (const fallback of fallbackOrder) {
      if (selected.some((item) => item._id === fallback._id)) continue;
      selected.push(fallback);
      if (selected.length >= minimumSpecialists) break;
    }
  }

  return selected.slice(0, TASK_HQ_COLLAB_MAX_SPECIALISTS);
}

function buildTaskLeadKickoffPrompt(args: {
  lead: AgentRecord;
  specialists: AgentRecord[];
  dispatch: ClaimedTaskDispatch;
}) {
  const specialistRoster = args.specialists
    .map((agent) => `- ${agent.name}: ${agent.role} (${levelLabel(agent.level)})`)
    .join("\n");

  return [
    `You are ${args.lead.name}, squad lead in Mission Control.`,
    buildPersonaBlock(args.lead),
    `Task: ${cleanText(args.dispatch.taskTitle)}`,
    `Description: ${cleanText(args.dispatch.taskDescription)}`,
    `Priority: ${args.dispatch.taskPriority}`,
    args.dispatch.taskTags.length > 0 ? `Tags: ${args.dispatch.taskTags.join(", ")}` : "",
    "Coordinate specialists. Do not perform full implementation yourself in this stage.",
    "Specialist roster:",
    specialistRoster || "- None",
    "Do in strict order:",
    `1) ${reportScriptPath} heartbeat ${args.lead.name} active "Planning task delegation"`,
    `2) ${reportScriptPath} chat ${args.lead.name} "Task plan: @<specialist> owns <workstream>; include 2-4 concise bullets."`,
    `3) ${reportScriptPath} heartbeat ${args.lead.name} idle "Delegation posted"`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTaskSpecialistPrompt(args: {
  specialist: AgentRecord;
  lead: AgentRecord;
  dispatch: ClaimedTaskDispatch;
  leadKickoff: string;
}) {
  return [
    `You are ${args.specialist.name} working inside Mission Control.`,
    buildPersonaBlock(args.specialist),
    `Lead directive from ${args.lead.name}: ${cleanText(args.leadKickoff || "No kickoff captured.")}`,
    `Task: ${cleanText(args.dispatch.taskTitle)}`,
    `Description: ${cleanText(args.dispatch.taskDescription)}`,
    "Work only in your specialty and produce actionable output.",
    "Do in strict order:",
    `1) ${reportScriptPath} heartbeat ${args.specialist.name} active "Executing specialist stream"`,
    `2) Perform your specialist analysis/implementation mentally and summarize concrete outcomes.`,
    `3) ${reportScriptPath} chat ${args.specialist.name} "@${args.lead.name} ${args.specialist.name} update: findings, decisions, blockers, and next step"`,
    `4) ${reportScriptPath} heartbeat ${args.specialist.name} idle "Specialist update posted"`,
  ].join("\n");
}

function buildTaskLeadSynthesisPrompt(args: {
  lead: AgentRecord;
  dispatch: ClaimedTaskDispatch;
  specialistUpdates: Array<{ name: string; text: string }>;
}) {
  const specialistUpdatesText = args.specialistUpdates
    .map((item) => `- ${item.name}: ${cleanText(item.text || "No update captured")}`)
    .join("\n");
  return [
    `You are ${args.lead.name}, squad lead in Mission Control.`,
    buildPersonaBlock(args.lead),
    `Task: ${cleanText(args.dispatch.taskTitle)}`,
    `Description: ${cleanText(args.dispatch.taskDescription)}`,
    "Specialist updates:",
    specialistUpdatesText || "- None",
    "Synthesize and communicate the integrated execution plan for this task.",
    "Do in strict order:",
    `1) ${reportScriptPath} heartbeat ${args.lead.name} active "Synthesizing team plan"`,
    `2) ${reportScriptPath} chat ${args.lead.name} "Team synthesis: consolidated plan, specialist handoffs, and immediate execution next steps"`,
    `3) ${reportScriptPath} heartbeat ${args.lead.name} idle "Team synthesis posted"`,
  ].join("\n");
}

async function getLatestAgentMessageInChannel(channel: string, agentId: Id<"agents">) {
  const messages = (await client.query(api.messages.list, { channel })) as MessageRecord[];
  const own = messages.filter((message) => message.agentId === agentId);
  return own.length === 0 ? null : own[own.length - 1];
}

async function waitForAgentReply(args: {
  channel: string;
  agentDbId: Id<"agents">;
  beforeMessageId: string | null;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = args.timeoutMs ?? 4000;
  const intervalMs = args.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const latest = await getLatestAgentMessageInChannel(args.channel, args.agentDbId);
    if (latest && latest._id !== args.beforeMessageId) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

async function persistFallbackHqMessage(args: {
  channel: string;
  agent: AgentRecord;
  assistantText: string;
}) {
  const fallbackText = args.assistantText.trim() || "No HQ update from agent.";
  await client.mutation(api.messages.send, {
    channel: args.channel,
    text: fallbackText,
    agentId: args.agent._id,
  });
}

async function ensureHqReplyPersisted(args: {
  channel: string;
  agent: AgentRecord;
  beforeMessageId: string | null;
  assistantText: string;
}) {
  const hasReply = await waitForAgentReply({
    channel: args.channel,
    agentDbId: args.agent._id,
    beforeMessageId: args.beforeMessageId,
    timeoutMs: 4500,
    intervalMs: 450,
  });
  if (hasReply) return;
  await persistFallbackHqMessage({
    channel: args.channel,
    agent: args.agent,
    assistantText: args.assistantText,
  });
}

async function runHqAgentStage(args: {
  dispatchId: Id<"taskDispatches">;
  dispatchTaskId: Id<"tasks">;
  channel: string;
  agent: AgentRecord;
  sessionSuffix: string;
  prompt: string;
  activeAuthProfile: ActiveAuthProfile | null;
}) {
  const runtimeAgentId = agentIdFromSessionKey(args.agent.sessionKey);
  const sessionId = `hq-task-${args.dispatchTaskId}-${args.sessionSuffix}-${runtimeAgentId}`;
  const before = await getLatestAgentMessageInChannel(args.channel, args.agent._id);
  const result = await runOpenClawAgentWithFailover({
    dispatchId: args.dispatchId,
    runtimeAgentId,
    sessionId,
    prompt: args.prompt,
    primaryModel: args.agent.models.thinking,
    fallbackModel: args.agent.models.fallback,
    modelCacheKey: args.agent.sessionKey,
    preferredAuthProfile: args.activeAuthProfile,
  });

  const assistantText = extractAssistantText(result);
  await ensureHqReplyPersisted({
    channel: args.channel,
    agent: args.agent,
    beforeMessageId: before?._id ?? null,
    assistantText,
  });

  const latest = await getLatestAgentMessageInChannel(args.channel, args.agent._id);
  return (latest?.text ?? latest?.content ?? "").trim();
}

async function runTaskHqCollaboration(args: {
  dispatch: ClaimedTaskDispatch;
  activeAuthProfile: ActiveAuthProfile | null;
}) {
  if (!TASK_HQ_COLLAB_ENABLED) return;

  const agents = (await client.query(api.agents.list)) as AgentRecord[];
  if (agents.length === 0) return;

  const target = agents.find((agent) => agent._id === args.dispatch.targetAgentId) ?? null;
  const lead = pickLeadAgent(agents, target);
  if (!lead) return;

  const specialists = pickTaskSpecialists({
    dispatch: args.dispatch,
    agents,
    lead,
    target,
  });

  console.log(
    `[task_hq_collab] dispatchId=${args.dispatch.dispatchId} lead=${lead.name} specialists=${specialists
      .map((agent) => agent.name)
      .join(",") || "-"}`
  );

  const kickoffText = await runHqAgentStage({
    dispatchId: args.dispatch.dispatchId,
    dispatchTaskId: args.dispatch.taskId,
    channel: "hq",
    agent: lead,
    sessionSuffix: "kickoff",
    prompt: buildTaskLeadKickoffPrompt({
      lead,
      specialists,
      dispatch: args.dispatch,
    }),
    activeAuthProfile: args.activeAuthProfile,
  });

  const specialistUpdates: Array<{ name: string; text: string }> = [];
  for (const specialist of specialists) {
    const text = await runHqAgentStage({
      dispatchId: args.dispatch.dispatchId,
      dispatchTaskId: args.dispatch.taskId,
      channel: "hq",
      agent: specialist,
      sessionSuffix: `spec-${specialist.name.toLowerCase()}`,
      prompt: buildTaskSpecialistPrompt({
        specialist,
        lead,
        dispatch: args.dispatch,
        leadKickoff: kickoffText,
      }),
      activeAuthProfile: args.activeAuthProfile,
    });
    specialistUpdates.push({ name: specialist.name, text });
  }

  await runHqAgentStage({
    dispatchId: args.dispatch.dispatchId,
    dispatchTaskId: args.dispatch.taskId,
    channel: "hq",
    agent: lead,
    sessionSuffix: "synthesis",
    prompt: buildTaskLeadSynthesisPrompt({
      lead,
      dispatch: args.dispatch,
      specialistUpdates,
    }),
    activeAuthProfile: args.activeAuthProfile,
  });
}

function buildTaskDispatchPrompt(dispatch: ClaimedTaskDispatch): string {
  const lines: string[] = [];
  lines.push(`Assigned Agent: ${dispatch.targetAgentName} (${dispatch.targetAgentRole}, ${dispatch.targetAgentLevel})`);
  if (dispatch.targetAgentSystemPrompt.trim()) {
    lines.push("");
    lines.push("Agent System Prompt:");
    lines.push(dispatch.targetAgentSystemPrompt.trim());
  }
  if (dispatch.targetAgentCharacter.trim()) {
    lines.push("");
    lines.push("Agent Character:");
    lines.push(dispatch.targetAgentCharacter.trim());
  }
  if (dispatch.targetAgentLore.trim()) {
    lines.push("");
    lines.push("Agent Lore:");
    lines.push(dispatch.targetAgentLore.trim());
  }
  lines.push("");
  lines.push(`Task: ${dispatch.taskTitle}`);
  lines.push(`Priority: ${dispatch.taskPriority}`);
  if (dispatch.taskTags.length > 0) {
    lines.push(`Tags: ${dispatch.taskTags.join(", ")}`);
  }
  if (dispatch.taskDescription.trim()) {
    lines.push("");
    lines.push("Task Description:");
    lines.push(dispatch.taskDescription.trim());
  }
  if (dispatch.prompt.trim()) {
    lines.push("");
    lines.push("Latest User Instruction:");
    lines.push(dispatch.prompt.trim());
  }
  const thread = dispatch.threadMessages
    .map((message) => `${message.fromUser ? "[HQ]" : "[Agent]"} ${message.text}`.trim())
    .filter(Boolean)
    .slice(-16);
  if (thread.length > 0) {
    lines.push("");
    lines.push("Recent Thread Context:");
    lines.push(thread.join("\n"));
  }
  lines.push("");
  lines.push("Continue this task and provide a concrete output.");
  return lines.join("\n");
}

async function processTaskDispatchQueue() {
  const dispatch = (await client.mutation(api.tasks.claimNextDispatch, {
    runner: watcherInstanceId,
  })) as ClaimedTaskDispatch | null;
  if (!dispatch) return;

  const runtimeAgentId = agentIdFromSessionKey(dispatch.targetSessionKey);
  const targetThinkingModel = normalizeModelId(dispatch.targetThinkingModel);
  const sessionId = `mission-${dispatch.taskId}`;
  const prompt = buildTaskDispatchPrompt(dispatch);
  const startedAt = Date.now();
  console.log(
    `[task_dispatch_started] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} target=${dispatch.targetAgentName} runtimeAgent=${runtimeAgentId}`
  );

  try {
    const shouldCancelBeforeStart = await client.query(api.tasks.shouldCancelDispatch, {
      dispatchId: dispatch.dispatchId,
    });
    if (shouldCancelBeforeStart) {
      await client.mutation(api.tasks.updateDispatchStatus, {
        dispatchId: dispatch.dispatchId,
        status: "cancelled",
        error: "Dispatch cancelled before execution",
      });
      console.log(
        `[task_dispatch_completed] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} status=cancelled durationMs=${
          Date.now() - startedAt
        } reason=preflight`
      );
      return;
    }

    const activeAuthProfile = await getActiveAuthProfile();

    try {
      await runTaskHqCollaboration({
        dispatch,
        activeAuthProfile,
      });
    } catch (error) {
      const collabError = error instanceof Error ? error.message : String(error);
      if (collabError === "Dispatch cancelled") throw error;
      console.error(
        `[task_hq_collab_failed] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} error=${collabError}`
      );
    }

    const result = await runOpenClawAgentWithFailover({
      dispatchId: dispatch.dispatchId,
      runtimeAgentId,
      sessionId,
      prompt,
      primaryModel: targetThinkingModel || dispatch.targetThinkingModel,
      fallbackModel: dispatch.targetFallbackModel,
      modelCacheKey: dispatch.targetSessionKey,
      preferredAuthProfile: activeAuthProfile,
    });

    const runId = extractRunId(result);
    const assistantText = extractAssistantText(result);
    await client.mutation(api.tasks.completeDispatch, {
      dispatchId: dispatch.dispatchId,
      runId,
      resultPreview: assistantText ? assistantText.slice(0, 300) : undefined,
    });
    console.log(
      `[task_dispatch_completed] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} status=success durationMs=${
        Date.now() - startedAt
      } runId=${runId ?? "-"}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === "Dispatch cancelled") {
      await client.mutation(api.tasks.updateDispatchStatus, {
        dispatchId: dispatch.dispatchId,
        status: "cancelled",
        error: errorMessage.slice(0, 1000),
      });
      console.log(
        `[task_dispatch_completed] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} status=cancelled durationMs=${
          Date.now() - startedAt
        }`
      );
      return;
    }
    await client.mutation(api.tasks.failDispatch, {
      dispatchId: dispatch.dispatchId,
      error: errorMessage.slice(0, 1000),
    });
    console.error(
      `[task_dispatch_completed] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} status=failed durationMs=${
        Date.now() - startedAt
      } error=${errorMessage}`
    );
  }
}

async function triggerOrchestrator(messageId?: string) {
  if (orchestratorBusy) return;
  orchestratorBusy = true;
  const startedAt = Date.now();
  const mode = messageId ? "single_message" : "manual";
  console.log(`[dispatch_started] source=watcher mode=${mode} messageId=${messageId ?? "-"}`);
  try {
    const orchestratorArgs = [tsxCliPath, orchestratorScriptPath];
    if (messageId) {
      orchestratorArgs.push("--message-id", messageId);
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        orchestratorArgs,
        {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        }
      );

      let stderr = "";
      child.stdout.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        process.stderr.write(chunk);
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr || `orchestrator exited with code ${code}`));
      });
    });
    const completedAt = Date.now();
    console.log(
      `[dispatch_completed] source=watcher mode=${mode} status=success messageId=${
        messageId ?? "-"
      } durationMs=${completedAt - startedAt}`
    );
  } catch (error) {
    const completedAt = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      `[dispatch_completed] source=watcher mode=${mode} status=failed messageId=${
        messageId ?? "-"
      } durationMs=${completedAt - startedAt} error=${errorMessage}`
    );
    await client.mutation(api.settings.set, {
      key: LAST_DISPATCH_RESULT_KEY,
      value: {
        at: completedAt,
        status: "failed",
        source: "watcher",
        mode,
        messageId: messageId ?? null,
        durationMs: completedAt - startedAt,
        error: errorMessage.slice(0, 1000),
      },
    });
    throw error;
  } finally {
    orchestratorBusy = false;
  }
}

async function checkAndDispatchNewUserMessage() {
  await loadLastSeenUserMessageId();

  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;
  const newestUserMessage = [...messages].reverse().find((m) => !m.agentId);
  if (!newestUserMessage) return;
  if (newestUserMessage._id === lastSeenUserMessageId) return;

  console.log(`[dispatch] new HQ user message ${newestUserMessage._id}`);
  await triggerOrchestrator(newestUserMessage._id);
  lastSeenUserMessageId = newestUserMessage._id;
  await client.mutation(api.settings.set, {
    key: WATCHER_LAST_SEEN_USER_MESSAGE_KEY,
    value: newestUserMessage._id,
  });
}

async function checkManualDispatchRequest() {
  const request = await client.query(api.settings.get, { key: MANUAL_DISPATCH_KEY });
  if (!request) return;
  const token = String(request.value ?? "");
  if (!token) return;
  if (token === lastManualDispatchToken) return;

  lastManualDispatchToken = token;
  console.log(`[dispatch] manual trigger token=${token}`);
  await triggerOrchestrator();
}

async function tick() {
  const now = Date.now();
  await refreshAutomationConfig(now);
  const leader = await ensureLeadership(now);
  const syncNow = Date.now();
  if (syncNow - lastAuthProfileDiscoveryAt >= AUTH_PROFILE_DISCOVERY_MS) {
    await syncAuthProfilesFromOpenClaw();
    lastAuthProfileDiscoveryAt = syncNow;
  }
  await syncAuthProfile();

  if (!leader) return;

  if (autoDispatchEnabled) {
    await checkAndDispatchNewUserMessage();
  }
  await checkManualDispatchRequest();
  await processTaskDispatchQueue();

  if (syncNow - lastModelSyncAt >= MODEL_SYNC_MS) {
    await syncModels();
    lastModelSyncAt = syncNow;
  }
}

async function main() {
  console.log(
    `Watcher active. poll=${POLL_MS}ms root=${missionControlRoot} instance=${watcherInstanceId}`
  );
  while (true) {
    try {
      await tick();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_RESULT_KEY,
        value: {
          at: Date.now(),
          status: "failed",
          source: "watcher",
          error: errorMessage.slice(0, 1000),
        },
      });
      console.error("Watcher loop error:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

let shuttingDown = false;
async function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  await releaseLeadership();
  process.exit(code);
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (error) => {
  console.error("Watcher fatal:", error);
  await releaseLeadership();
  process.exit(1);
});
