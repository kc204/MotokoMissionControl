import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import os from "os";
import path from "path";
import { loadMissionControlEnv, resolveMissionControlRoot, resolveScriptPath } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const POLL_MS = Number(process.env.WATCHER_POLL_MS || 1000);
const MODEL_SYNC_MS = Number(process.env.WATCHER_MODEL_SYNC_MS || 60000);
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
const missionControlRoot = resolveMissionControlRoot();
const tsxCliPath = path.join(missionControlRoot, "node_modules", "tsx", "dist", "cli.mjs");
const orchestratorScriptPath = resolveScriptPath("orchestrator.ts");
const OPENCLAW_AUTH_PROFILES_PATH =
  process.env.OPENCLAW_AUTH_PROFILES_PATH ||
  path.join(os.homedir(), ".openclaw", "agents", "main", "agent", "auth-profiles.json");
const watcherInstanceId = `${os.hostname()}:${process.pid}`;

const client = new ConvexHttpClient(convexUrl);
const modelCache = new Map<string, string>();
let activeAuthProfile: string | null = null;
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

async function runOpenClawJson<T>(args: string[]): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
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
    const desired = agent.models.thinking;
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

type DispatchThreadMessage = {
  fromUser: boolean;
  text: string;
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

  const syncKey = `${provider}:${active.profileId}`;
  if (syncKey === activeAuthProfile) return;

  const agents = await client.query(api.agents.list);
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      const openclawAgentId = agentIdFromSessionKey(agent.sessionKey);
      await runOpenClaw([
        "models",
        "auth",
        "order",
        "set",
        "--provider",
        provider,
        "--agent",
        openclawAgentId,
        active.profileId,
      ]);
      return agent.name;
    })
  );

  let successCount = 0;
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === "fulfilled") {
      successCount += 1;
      continue;
    }
    const agentName = agents[i]?.name ?? "unknown";
    console.error(`[auth] failed for ${agentName}:`, result.reason);
  }

  if (successCount > 0) {
    activeAuthProfile = syncKey;
    console.log(
      `[auth] active profile set to ${active.profileId} provider=${provider} syncedAgents=${successCount}/${agents.length}`
    );
    return;
  }

  console.error(
    `[auth] no agent auth orders updated for profile ${active.profileId} provider=${provider}`
  );
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
  const sessionId = `mission-${dispatch.taskId}`;
  const prompt = buildTaskDispatchPrompt(dispatch);
  const startedAt = Date.now();
  console.log(
    `[task_dispatch_started] dispatchId=${dispatch.dispatchId} taskId=${dispatch.taskId} target=${dispatch.targetAgentName} runtimeAgent=${runtimeAgentId}`
  );

  try {
    const result = await runOpenClawJson<unknown>([
      "agent",
      "--agent",
      runtimeAgentId,
      "--session-id",
      sessionId,
      "--message",
      prompt,
      "--json",
    ]);

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
