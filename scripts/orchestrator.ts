import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import os from "os";
import {
  buildTsxCommand,
  loadMissionControlEnv,
  normalizeModelId,
  parseOpenClawJsonOutput,
  resolveModelFromCatalog,
} from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const DEDUPE_KEY = "orchestrator:last_hq_message_id";
const LAST_DISPATCH_RESULT_KEY = "probe:last_dispatch_result";
const LAST_DISPATCH_STARTED_KEY = "probe:last_dispatch_started";
const LAST_REPORT_CHAT_KEY = "probe:last_report_chat_write";
const reportScriptPath = buildTsxCommand("report.ts");
const ORCHESTRATOR_MIN_SPECIALISTS = Math.max(1, Number(process.env.ORCHESTRATOR_MIN_SPECIALISTS || 2));
const ORCHESTRATOR_FAILOVER_ENABLED = process.env.ORCHESTRATOR_FAILOVER_ENABLED !== "false";
const SESSION_LEASE_KEY_PREFIX = "openclaw:session:";
const SESSION_LEASE_TTL_MS = Math.max(30_000, Number(process.env.SESSION_LEASE_TTL_MS || 10 * 60 * 1000));
const SESSION_LEASE_WAIT_MS = Math.max(2_000, Number(process.env.SESSION_LEASE_WAIT_MS || 20_000));
const SESSION_LEASE_POLL_MS = Math.max(250, Number(process.env.SESSION_LEASE_POLL_MS || 500));
const orchestratorInstanceId = `${os.hostname()}:${process.pid}`;

const client = new ConvexHttpClient(convexUrl);
const runtimeModelCache = new Map<string, string>();
const runtimeAuthCache = new Map<string, string>();
let availableModelIds = new Set<string>();
let hasLoadedModelCatalog = false;

type AgentRecord = {
  _id: Id<"agents">;
  name: string;
  role: string;
  level?: "LEAD" | "INT" | "SPC";
  sessionKey: string;
  models: {
    thinking: string;
    execution?: string;
    heartbeat: string;
    fallback: string;
  };
  systemPrompt?: string;
  character?: string;
  lore?: string;
};

type OrchestratorMessage = {
  _id: string;
  text?: string;
  content?: string;
  mentions?: string[];
  agentId?: Id<"agents">;
};

type AuthProfileCandidate = {
  provider: string;
  profileId: string;
};

function extractModelIds(payload: unknown) {
  const out = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.includes("/") || /^[a-z0-9._-]+$/i.test(trimmed)) out.add(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string") out.add(obj.id.trim());
    if (typeof obj.model === "string") out.add(obj.model.trim());
    if (typeof obj.name === "string" && obj.name.includes("/")) out.add(obj.name.trim());
    for (const nested of Object.values(obj)) visit(nested);
  };
  visit(payload);
  return out;
}

async function refreshModelCatalog() {
  try {
    const payload = await runOpenClawJson<unknown>(["models", "list", "--json"]);
    const next = extractModelIds(payload);
    if (next.size > 0) {
      availableModelIds = next;
      hasLoadedModelCatalog = true;
    }
  } catch {
    // Best effort; keep running with raw model ids.
  }
}

function spawnOpenClaw(args: string[]) {
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", OPENCLAW_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(OPENCLAW_BIN, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { channel: string; onceMessageId?: string } = { channel: "hq" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--channel" && args[i + 1]) {
      out.channel = args[i + 1];
      i += 1;
    } else if (arg === "--message-id" && args[i + 1]) {
      out.onceMessageId = args[i + 1];
      i += 1;
    }
  }
  return out;
}

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return "main";
}

function routeAgentName(text: string, mentions: string[], knownAgentNames: string[]): string {
  for (const tag of mentions) {
    const candidate = tag.replace(/^@/, "").toLowerCase();
    const matched = knownAgentNames.find((n) => n.toLowerCase() === candidate);
    if (matched) return matched;
  }

  const lowerText = text.toLowerCase();
  if (lowerText.includes("research") || lowerText.includes("competitor") || lowerText.includes("source")) return "Recon";
  if (lowerText.includes("write") || lowerText.includes("content") || lowerText.includes("blog")) return "Quill";
  if (lowerText.includes("code") || lowerText.includes("bug") || lowerText.includes("deploy")) return "Forge";
  if (lowerText.includes("metric") || lowerText.includes("analytics") || lowerText.includes("conversion")) return "Pulse";
  return "Motoko";
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

function isPermanentDispatchError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("unknown model") ||
    lower.includes("specified without provider") ||
    lower.includes("model not found")
  );
}

function levelLabel(level?: "LEAD" | "INT" | "SPC") {
  if (level === "LEAD") return "Lead";
  if (level === "INT") return "Integrator";
  if (level === "SPC") return "Specialist";
  return "Specialist";
}

function buildAgentPersonaBlock(agent: AgentRecord) {
  const lines = [
    `${agent.name} Role: ${agent.role} (${levelLabel(agent.level)})`,
  ];
  if (agent.systemPrompt?.trim()) lines.push(`System Prompt: ${cleanText(agent.systemPrompt)}`);
  if (agent.character?.trim()) lines.push(`Character: ${cleanText(agent.character)}`);
  if (agent.lore?.trim()) lines.push(`Lore: ${cleanText(agent.lore)}`);
  return lines.join("\n");
}

function parseMentionedAgentNames(mentions: string[], knownAgentNames: string[]) {
  const out: string[] = [];
  for (const tag of mentions) {
    const candidate = tag.replace(/^@/, "").toLowerCase();
    const matched = knownAgentNames.find((name) => name.toLowerCase() === candidate);
    if (!matched) continue;
    if (!out.includes(matched)) out.push(matched);
  }
  return out;
}

function findAgentByName(agents: AgentRecord[], name: string) {
  return agents.find((agent) => agent.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function pickSpecialistsForMission(args: {
  userMessage: string;
  mentions: string[];
  agents: AgentRecord[];
  leadName: string;
}) {
  const knownNames = args.agents.map((agent) => agent.name);
  const mentioned = parseMentionedAgentNames(args.mentions, knownNames);
  if (args.mentions.some((tag) => tag.toLowerCase() === "@all")) {
    return args.agents.filter((agent) => agent.name !== args.leadName);
  }

  const explicitlyMentionedSpecialists = mentioned
    .map((name) => findAgentByName(args.agents, name))
    .filter((agent): agent is AgentRecord => !!agent && agent.name !== args.leadName);
  if (explicitlyMentionedSpecialists.length > 0) return explicitlyMentionedSpecialists;

  const lowerText = args.userMessage.toLowerCase();
  const specialistByName = new Map(args.agents.map((agent) => [agent.name, agent]));
  const selected: AgentRecord[] = [];

  const keywordRules: Array<{ name: string; keywords: string[] }> = [
    { name: "Recon", keywords: ["research", "competitor", "source", "find", "investigate"] },
    { name: "Forge", keywords: ["code", "bug", "deploy", "build", "fix", "refactor"] },
    { name: "Quill", keywords: ["write", "content", "copy", "docs", "document", "post"] },
    { name: "Pulse", keywords: ["metric", "analytics", "conversion", "monitor", "performance"] },
  ];

  for (const rule of keywordRules) {
    if (!rule.keywords.some((keyword) => lowerText.includes(keyword))) continue;
    const specialist = specialistByName.get(rule.name);
    if (!specialist || specialist.name === args.leadName) continue;
    if (!selected.some((agent) => agent._id === specialist._id)) {
      selected.push(specialist);
    }
  }

  const fallbackOrder = ["Forge", "Recon", "Quill", "Pulse"]
    .map((name) => specialistByName.get(name))
    .filter((agent): agent is AgentRecord => !!agent && agent.name !== args.leadName);

  const minimumSpecialists = Math.min(
    ORCHESTRATOR_MIN_SPECIALISTS,
    fallbackOrder.length || selected.length
  );
  for (const fallback of fallbackOrder) {
    if (selected.some((agent) => agent._id === fallback._id)) continue;
    selected.push(fallback);
    if (selected.length >= minimumSpecialists) break;
  }

  return selected;
}

function buildSingleAgentPrompt(agent: AgentRecord, userMessage: string) {
  const cleanTask = cleanText(userMessage);
  return [
    `You are ${agent.name} operating inside Mission Control.`,
    buildAgentPersonaBlock(agent),
    `Task from HQ: ${cleanTask}`,
    `Do in order: (1) ${reportScriptPath} heartbeat ${agent.name} active \"Working on HQ task\";`,
    `(2) perform the task;`,
    `(3) post your actual answer via ${reportScriptPath} chat ${agent.name} \"YOUR_FINAL_ANSWER\";`,
    `(4) ${reportScriptPath} heartbeat ${agent.name} idle \"Task complete\".`,
    "Your final answer must be plain text, specific, and non-empty.",
    "Do not output NO_REPLY. If a report command fails, include full error and retry once.",
  ].join("\n");
}

function buildLeadKickoffPrompt(lead: AgentRecord, specialists: AgentRecord[], userMessage: string) {
  const cleanTask = cleanText(userMessage);
  const specialistRoster = specialists
    .map((agent) => `- ${agent.name}: ${agent.role} (${levelLabel(agent.level)})`)
    .join("\n");

  return [
    `You are ${lead.name}, the squad lead in Mission Control.`,
    buildAgentPersonaBlock(lead),
    `Mission from HQ: ${cleanTask}`,
    "Your job is to coordinate specialists, not to do all implementation yourself.",
    "Specialists available:",
    specialistRoster || "- None",
    `Do in strict order:`,
    `1) ${reportScriptPath} heartbeat ${lead.name} active "Coordinating delegation"`,
    `2) Create a delegation bulletin and post it in HQ via ${reportScriptPath} chat ${lead.name} "..."`,
    "3) Bulletin must include 2-4 concise bullets, each assigning one specialist by @Name with a concrete workstream.",
    `4) Do not provide final solution yet.`,
    `5) ${reportScriptPath} heartbeat ${lead.name} idle "Delegation issued"`,
  ].join("\n");
}

function buildSpecialistPrompt(args: {
  specialist: AgentRecord;
  lead: AgentRecord;
  userMessage: string;
  leadKickoff: string;
}) {
  const cleanTask = cleanText(args.userMessage);
  const kickoff = cleanText(args.leadKickoff || "No kickoff bulletin captured.");
  return [
    `You are ${args.specialist.name} in Mission Control.`,
    buildAgentPersonaBlock(args.specialist),
    `HQ mission: ${cleanTask}`,
    `Lead directive from ${args.lead.name}: ${kickoff}`,
    `Work only in your specialty (${args.specialist.role}); do not attempt the full cross-domain solution.`,
    `Do in strict order:`,
    `1) ${reportScriptPath} heartbeat ${args.specialist.name} active "Executing specialist workstream"`,
    `2) Perform your specialist work and create concrete output.`,
    `3) Post update in HQ via ${reportScriptPath} chat ${args.specialist.name} "@${args.lead.name} ${args.specialist.name} update: <key findings + output + open risks>"`,
    `4) ${reportScriptPath} heartbeat ${args.specialist.name} idle "Specialist update sent"`,
    "Keep it concise and actionable.",
  ].join("\n");
}

function buildLeadSynthesisPrompt(args: {
  lead: AgentRecord;
  userMessage: string;
  specialists: AgentRecord[];
  specialistUpdates: Array<{ name: string; update: string }>;
}) {
  const cleanTask = cleanText(args.userMessage);
  const updatesText = args.specialistUpdates
    .map((item) => `- ${item.name}: ${cleanText(item.update || "No update captured")}`)
    .join("\n");
  const specialistNames = args.specialists.map((agent) => agent.name).join(", ");

  return [
    `You are ${args.lead.name}, the squad lead in Mission Control.`,
    buildAgentPersonaBlock(args.lead),
    `HQ mission: ${cleanTask}`,
    `Specialists involved: ${specialistNames || "none"}`,
    `Collected specialist updates:`,
    updatesText || "- No specialist updates captured.",
    `Do in strict order:`,
    `1) ${reportScriptPath} heartbeat ${args.lead.name} active "Synthesizing team output"`,
    `2) Post final integrated response in HQ via ${reportScriptPath} chat ${args.lead.name} "FINAL: <integrated answer>\\nTEAM CONTRIBUTIONS: <who did what>\\nNEXT ACTIONS: <clear next steps>"`,
    `3) ${reportScriptPath} heartbeat ${args.lead.name} idle "Mission response delivered"`,
    "This final message must credit specialists and provide the concrete final answer for HQ.",
  ].join("\n");
}

type OpenClawRunResult = {
  assistantText: string;
};

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

async function getAuthProfileCandidates() {
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
  for (const profile of normalized) {
    if (seen.has(profile.profileId)) continue;
    seen.add(profile.profileId);
    deduped.push({ provider: profile.provider, profileId: profile.profileId });
  }
  return deduped;
}

async function ensureAgentRuntimeConfig(args: {
  agentRuntimeId: string;
  thinkingModel: string;
  authProfile: AuthProfileCandidate | null;
}) {
  const normalizedModel = normalizeModelId(args.thinkingModel);
  if (args.authProfile) {
    const authKey = `${args.authProfile.provider}:${args.authProfile.profileId}`;
    if (runtimeAuthCache.get(args.agentRuntimeId) !== authKey) {
      await runOpenClawAgentCommand([
        "models",
        "auth",
        "order",
        "set",
        "--provider",
        args.authProfile.provider,
        "--agent",
        args.agentRuntimeId,
        args.authProfile.profileId,
      ]);
      runtimeAuthCache.set(args.agentRuntimeId, authKey);
    }
  }

  if (normalizedModel && runtimeModelCache.get(args.agentRuntimeId) !== normalizedModel) {
    await runOpenClawAgentCommand(["models", "--agent", args.agentRuntimeId, "set", normalizedModel]);
    runtimeModelCache.set(args.agentRuntimeId, normalizedModel);
  }
}

async function runOpenClawAgentCommand(args: string[]): Promise<void> {
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
      if (code === 0) {
        try {
          resolve(parseOpenClawJsonOutput<T>(stdout));
          return;
        } catch (error) {
          reject(error);
          return;
        }
      }
      reject(new Error(stderr || `openclaw exited with code ${code}`));
    });
  });
}

async function withSessionLease<T>(sessionId: string, owner: string, fn: () => Promise<T>): Promise<T> {
  const key = `${SESSION_LEASE_KEY_PREFIX}${sessionId}`;
  const deadline = Date.now() + SESSION_LEASE_WAIT_MS;
  let acquired = false;
  while (!acquired) {
    const lease = await client.mutation(api.settings.acquireLease, {
      key,
      owner,
      ttlMs: SESSION_LEASE_TTL_MS,
    });
    acquired = lease.acquired;
    if (acquired) break;
    if (Date.now() >= deadline) {
      throw new Error(`session lease timeout for ${sessionId}: owner=${lease.owner ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, SESSION_LEASE_POLL_MS));
  }

  try {
    return await fn();
  } finally {
    await client.mutation(api.settings.releaseLease, { key, owner }).catch(() => undefined);
  }
}

async function runOpenClawAgent(agentId: string, sessionId: string, prompt: string): Promise<OpenClawRunResult> {
  return await new Promise<OpenClawRunResult>((resolve, reject) => {
    const args = ["agent", "--agent", agentId, "--session-id", sessionId, "--message", prompt, "--json"];
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
      if (code === 0) {
        try {
          const parsed = parseOpenClawJsonOutput<unknown>(stdout);
          resolve({ assistantText: extractAssistantText(parsed) });
          return;
        } catch {
          resolve({ assistantText: "" });
          return;
        }
      }
      reject(new Error(stderr || `openclaw exited with code ${code}`));
    });
  });
}

async function getLatestAgentMessageInChannel(channel: string, agentId: Id<"agents">) {
  const messages = await client.query(api.messages.list, { channel });
  const own = messages.filter((m) => m.agentId === agentId);
  return own.length === 0 ? null : own[own.length - 1];
}

async function waitForAgentReply(args: {
  channel: string;
  agentDbId: Id<"agents">;
  beforeMessageId: string | null;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = args.timeoutMs ?? 3000;
  const intervalMs = args.intervalMs ?? 300;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const latest = await getLatestAgentMessageInChannel(args.channel, args.agentDbId);
    if (latest && latest._id !== args.beforeMessageId) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

async function persistFallbackHqMessage(args: {
  channel: string;
  agentDbId: Id<"agents">;
  agentName: string;
  assistantText: string;
}) {
  const fallbackText = args.assistantText.trim() || "No reply from agent.";
  const messageId = await client.mutation(api.messages.send, {
    channel: args.channel,
    text: fallbackText,
    agentId: args.agentDbId,
  });
  const now = Date.now();
  await client.mutation(api.settings.set, {
    key: LAST_REPORT_CHAT_KEY,
    value: {
      at: now,
      agentName: args.agentName,
      messageId,
      preview: fallbackText.slice(0, 180),
      source: "orchestrator_fallback",
    },
  });
  console.log(
    `[report_write_confirmed] channel=${args.channel} messageId=${messageId} agent=${args.agentName} source=orchestrator_fallback`
  );
}

async function ensureHqReplyPersisted(args: {
  channel: string;
  agentDbId: Id<"agents">;
  agentName: string;
  beforeMessageId: string | null;
  assistantText: string;
}) {
  const hasReply = await waitForAgentReply({
    channel: args.channel,
    agentDbId: args.agentDbId,
    beforeMessageId: args.beforeMessageId,
    timeoutMs: 4000,
    intervalMs: 400,
  });
  if (hasReply) return;
  await persistFallbackHqMessage(args);
}

async function runOpenClawAndEnsureReply(args: {
  channel: string;
  agentDbId: Id<"agents">;
  agentName: string;
  agentRuntimeId: string;
  sessionId: string;
  thinkingModel: string;
  fallbackModel?: string;
  prompt: string;
}) {
  const before = await getLatestAgentMessageInChannel(args.channel, args.agentDbId);
  if (!hasLoadedModelCatalog) {
    await refreshModelCatalog();
  }

  const modelCandidates = [
    resolveModelFromCatalog(normalizeModelId(args.thinkingModel), availableModelIds),
    resolveModelFromCatalog(normalizeModelId(args.fallbackModel ?? ""), availableModelIds),
  ].filter((model, index, all) => !!model && all.indexOf(model) === index);

  const authCandidates = ORCHESTRATOR_FAILOVER_ENABLED
    ? await getAuthProfileCandidates()
    : [];
  const authCandidateList: Array<AuthProfileCandidate | null> =
    authCandidates.length > 0 ? authCandidates : [null];

  const attempts: Array<{ model: string; auth: AuthProfileCandidate | null }> = [];
  for (const model of modelCandidates) {
    for (const auth of authCandidateList) {
      attempts.push({ model, auth });
    }
  }
  if (attempts.length === 0) {
    attempts.push({ model: normalizeModelId(args.thinkingModel), auth: null });
  }

  let lastError: Error | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    const hasMoreAttempts = i < attempts.length - 1;

    try {
      await ensureAgentRuntimeConfig({
        agentRuntimeId: args.agentRuntimeId,
        thinkingModel: attempt.model,
        authProfile: attempt.auth,
      });
      const result = await withSessionLease(
        args.sessionId,
        `${orchestratorInstanceId}:${args.agentRuntimeId}:${args.sessionId}`,
        async () => await runOpenClawAgent(args.agentRuntimeId, args.sessionId, args.prompt)
      );
      await ensureHqReplyPersisted({
        channel: args.channel,
        agentDbId: args.agentDbId,
        agentName: args.agentName,
        beforeMessageId: before?._id ?? null,
        assistantText: result.assistantText,
      });
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const hasReply = await waitForAgentReply({
        channel: args.channel,
        agentDbId: args.agentDbId,
        beforeMessageId: before?._id ?? null,
        timeoutMs: 3000,
        intervalMs: 300,
      });
      if (hasReply) {
        console.warn(
          `[dispatch_retry_skip] agent=${args.agentRuntimeId} reason=${errorMessage} reply=already_persisted`
        );
        return;
      }

      lastError = error instanceof Error ? error : new Error(errorMessage);
      if (ORCHESTRATOR_FAILOVER_ENABLED && isQuotaLikeError(errorMessage) && hasMoreAttempts) {
        console.warn(
          `[dispatch_failover] agent=${args.agentRuntimeId} model=${attempt.model} auth=${
            attempt.auth?.profileId ?? "-"
          } reason=${errorMessage}`
        );
        continue;
      }
      throw lastError;
    }
  }

  if (lastError) throw lastError;
  throw new Error("OpenClaw run failed without a captured error");
}

async function persistPermanentDispatchFailure(args: {
  channel: string;
  messageId: string;
  agentDbId: Id<"agents">;
  agentName: string;
  mode: "single" | "team";
  errorMessage: string;
}) {
  const conciseError = cleanText(args.errorMessage).slice(0, 300);
  const text = `[dispatch_failure] message=${args.messageId} mode=${args.mode} agent=${args.agentName} reason=${conciseError}`;
  await client.mutation(api.messages.send, {
    channel: args.channel,
    text,
    agentId: args.agentDbId,
  });
  await client.mutation(api.settings.set, { key: DEDUPE_KEY, value: args.messageId });
  console.warn(
    `[dispatch_permanent_failure_handled] messageId=${args.messageId} mode=${args.mode} agent=${args.agentName}`
  );
}

async function selectPendingMessages(channel: string, explicitId?: string) {
  const messages = (await client.query(api.messages.list, { channel })) as OrchestratorMessage[];
  const userMessages = messages.filter((m) => !m.agentId);

  if (explicitId) {
    return userMessages.filter((m) => m._id === explicitId);
  }

  const pointer = await client.query(api.settings.get, { key: DEDUPE_KEY });
  const lastSeen = (pointer?.value as string | undefined) ?? null;
  if (!lastSeen) return userMessages.slice(-1);

  const idx = userMessages.findIndex((m) => m._id === lastSeen);
  if (idx < 0) return userMessages.slice(-1);
  return userMessages.slice(idx + 1);
}

async function runAgentStage(args: {
  channel: string;
  agent: AgentRecord;
  prompt: string;
  activeMessage: string;
  idleMessage: string;
  messageId: string;
  stage: string;
}) {
  const runtimeAgentId = agentIdFromSessionKey(args.agent.sessionKey);
  const stageStartedAt = Date.now();
  console.log(
    `[team_stage_started] messageId=${args.messageId} stage=${args.stage} agent=${args.agent.name} runtimeAgent=${runtimeAgentId}`
  );

  await client.mutation(api.agents.updateStatus, {
    id: args.agent._id,
    status: "active",
    message: args.activeMessage,
  });

  try {
    const sessionId = `hq-${args.messageId}-${args.stage}-${runtimeAgentId}`;
    await runOpenClawAndEnsureReply({
      channel: args.channel,
      agentDbId: args.agent._id,
      agentName: args.agent.name,
      agentRuntimeId: runtimeAgentId,
      sessionId,
      thinkingModel: args.agent.models.thinking,
      fallbackModel: args.agent.models.fallback,
      prompt: args.prompt,
    });
  } finally {
    await client.mutation(api.agents.updateStatus, {
      id: args.agent._id,
      status: "idle",
      message: args.idleMessage,
    });
  }

  const latest = (await getLatestAgentMessageInChannel(args.channel, args.agent._id)) as
    | (OrchestratorMessage & { text?: string; content?: string })
    | null;
  const latestText = (latest?.text ?? latest?.content ?? "").trim();

  console.log(
    `[team_stage_completed] messageId=${args.messageId} stage=${args.stage} agent=${args.agent.name} durationMs=${
      Date.now() - stageStartedAt
    } hasReply=${latestText ? "true" : "false"}`
  );

  return latestText;
}

async function runTeamWorkflow(args: {
  channel: string;
  message: OrchestratorMessage;
  lead: AgentRecord;
  specialists: AgentRecord[];
}) {
  const userText = args.message.text || args.message.content || "";

  const kickoffPrompt = buildLeadKickoffPrompt(args.lead, args.specialists, userText);
  const kickoffText = await runAgentStage({
    channel: args.channel,
    agent: args.lead,
    prompt: kickoffPrompt,
    activeMessage: "Delegating mission",
    idleMessage: "Delegation issued",
    messageId: args.message._id,
    stage: "lead_kickoff",
  });

  const specialistUpdates: Array<{ name: string; update: string }> = [];
  for (const specialist of args.specialists) {
    const specialistPrompt = buildSpecialistPrompt({
      specialist,
      lead: args.lead,
      userMessage: userText,
      leadKickoff: kickoffText,
    });
    try {
      const updateText = await runAgentStage({
        channel: args.channel,
        agent: specialist,
        prompt: specialistPrompt,
        activeMessage: "Working specialist stream",
        idleMessage: "Specialist stream complete",
        messageId: args.message._id,
        stage: `specialist_${specialist.name.toLowerCase()}`,
      });
      specialistUpdates.push({ name: specialist.name, update: updateText });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[team_stage_failed] messageId=${args.message._id} stage=specialist_${specialist.name.toLowerCase()} agent=${specialist.name} error=${errorMessage}`
      );
      specialistUpdates.push({
        name: specialist.name,
        update: `[FAILED] ${specialist.name}: ${cleanText(errorMessage).slice(0, 240)}`,
      });
      continue;
    }
  }

  const synthesisPrompt = buildLeadSynthesisPrompt({
    lead: args.lead,
    userMessage: userText,
    specialists: args.specialists,
    specialistUpdates,
  });

  const finalText = await runAgentStage({
    channel: args.channel,
    agent: args.lead,
    prompt: synthesisPrompt,
    activeMessage: "Synthesizing team output",
    idleMessage: "Mission complete",
    messageId: args.message._id,
    stage: "lead_synthesis",
  });

  return {
    kickoffText,
    finalText,
    specialistUpdates,
  };
}

async function main() {
  const { channel, onceMessageId } = parseArgs();
  const pending = await selectPendingMessages(channel, onceMessageId);
  if (pending.length === 0) {
    console.log("No pending HQ user messages.");
    return;
  }

  const agents = (await client.query(api.agents.list)) as AgentRecord[];
  const names = agents.map((a) => a.name);
  const defaultLead = findAgentByName(agents, "Motoko");

  for (const msg of pending) {
    const text = msg.text || msg.content || "";
    const mentions = msg.mentions ?? [];
    const startedAt = Date.now();

    const lead = defaultLead;
    if (!lead) {
      const targetName = routeAgentName(text, mentions, names);
      const target = findAgentByName(agents, targetName);
      if (!target) {
        console.error(`Cannot route message ${msg._id}: no target agent found`);
        continue;
      }
      const targetAgentId = agentIdFromSessionKey(target.sessionKey);
      const prompt = buildSingleAgentPrompt(target, text);
      console.log(`[dispatch_started] messageId=${msg._id} mode=single target=${target.name} agentId=${targetAgentId}`);
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_STARTED_KEY,
        value: {
          at: startedAt,
          messageId: msg._id,
          mode: "single",
          targetName: target.name,
          targetAgentId,
        },
      });

      try {
        await runAgentStage({
          channel,
          agent: target,
          prompt,
          activeMessage: "Dispatched by orchestrator",
          idleMessage: "Awaiting next task",
          messageId: msg._id,
          stage: "single_dispatch",
        });
        const completedAt = Date.now();
        console.log(
          `[dispatch_completed] messageId=${msg._id} mode=single target=${target.name} status=success durationMs=${
            completedAt - startedAt
          }`
        );
        await client.mutation(api.settings.set, {
          key: LAST_DISPATCH_RESULT_KEY,
          value: {
            at: completedAt,
            messageId: msg._id,
            mode: "single",
            targetName: target.name,
            targetAgentId,
            status: "success",
            durationMs: completedAt - startedAt,
          },
        });
        await client.mutation(api.settings.set, { key: DEDUPE_KEY, value: msg._id });
      } catch (error) {
        const completedAt = Date.now();
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[dispatch_completed] messageId=${msg._id} mode=single target=${target.name} status=failed durationMs=${
            completedAt - startedAt
          } error=${errorMessage}`
        );
        await client.mutation(api.settings.set, {
          key: LAST_DISPATCH_RESULT_KEY,
          value: {
            at: completedAt,
            messageId: msg._id,
            mode: "single",
            targetName: target.name,
            targetAgentId,
            status: "failed",
            durationMs: completedAt - startedAt,
            error: errorMessage.slice(0, 1000),
          },
        });
        if (isPermanentDispatchError(errorMessage)) {
          await persistPermanentDispatchFailure({
            channel,
            messageId: msg._id,
            agentDbId: target._id,
            agentName: target.name,
            mode: "single",
            errorMessage,
          });
          continue;
        }
        throw error;
      }
      continue;
    }

    const specialists = pickSpecialistsForMission({
      userMessage: text,
      mentions,
      agents,
      leadName: lead.name,
    });

    if (specialists.length === 0) {
      const targetName = routeAgentName(text, mentions, names);
      const target = findAgentByName(agents, targetName) ?? lead;
      const targetAgentId = agentIdFromSessionKey(target.sessionKey);
      const prompt = buildSingleAgentPrompt(target, text);
      console.log(`[dispatch_started] messageId=${msg._id} mode=single target=${target.name} agentId=${targetAgentId}`);
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_STARTED_KEY,
        value: {
          at: startedAt,
          messageId: msg._id,
          mode: "single",
          targetName: target.name,
          targetAgentId,
        },
      });

      try {
        await runAgentStage({
          channel,
          agent: target,
          prompt,
          activeMessage: "Dispatched by orchestrator",
          idleMessage: "Awaiting next task",
          messageId: msg._id,
          stage: "single_dispatch",
        });
        const completedAt = Date.now();
        console.log(
          `[dispatch_completed] messageId=${msg._id} mode=single target=${target.name} status=success durationMs=${
            completedAt - startedAt
          }`
        );
        await client.mutation(api.settings.set, {
          key: LAST_DISPATCH_RESULT_KEY,
          value: {
            at: completedAt,
            messageId: msg._id,
            mode: "single",
            targetName: target.name,
            targetAgentId,
            status: "success",
            durationMs: completedAt - startedAt,
          },
        });
        await client.mutation(api.settings.set, { key: DEDUPE_KEY, value: msg._id });
      } catch (error) {
        const completedAt = Date.now();
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[dispatch_completed] messageId=${msg._id} mode=single target=${target.name} status=failed durationMs=${
            completedAt - startedAt
          } error=${errorMessage}`
        );
        await client.mutation(api.settings.set, {
          key: LAST_DISPATCH_RESULT_KEY,
          value: {
            at: completedAt,
            messageId: msg._id,
            mode: "single",
            targetName: target.name,
            targetAgentId,
            status: "failed",
            durationMs: completedAt - startedAt,
            error: errorMessage.slice(0, 1000),
          },
        });
        if (isPermanentDispatchError(errorMessage)) {
          await persistPermanentDispatchFailure({
            channel,
            messageId: msg._id,
            agentDbId: target._id,
            agentName: target.name,
            mode: "single",
            errorMessage,
          });
          continue;
        }
        throw error;
      }
      continue;
    }

    const leadRuntimeId = agentIdFromSessionKey(lead.sessionKey);
    console.log(
      `[dispatch_started] messageId=${msg._id} mode=team lead=${lead.name} specialists=${specialists
        .map((agent) => agent.name)
        .join(",")}`
    );
    await client.mutation(api.settings.set, {
      key: LAST_DISPATCH_STARTED_KEY,
      value: {
        at: startedAt,
        messageId: msg._id,
        mode: "team",
        targetName: lead.name,
        targetAgentId: leadRuntimeId,
        specialistNames: specialists.map((agent) => agent.name),
      },
    });

    try {
      const result = await runTeamWorkflow({
        channel,
        message: msg,
        lead,
        specialists,
      });

      const completedAt = Date.now();
      console.log(
        `[dispatch_completed] messageId=${msg._id} mode=team lead=${lead.name} status=success durationMs=${
          completedAt - startedAt
        }`
      );
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_RESULT_KEY,
        value: {
          at: completedAt,
          messageId: msg._id,
          mode: "team",
          targetName: lead.name,
          targetAgentId: leadRuntimeId,
          specialistNames: specialists.map((agent) => agent.name),
          specialistUpdates: result.specialistUpdates.map((item) => ({
            name: item.name,
            preview: item.update.slice(0, 180),
          })),
          finalPreview: result.finalText.slice(0, 180),
          status: "success",
          durationMs: completedAt - startedAt,
        },
      });
      await client.mutation(api.settings.set, { key: DEDUPE_KEY, value: msg._id });
    } catch (error) {
      const completedAt = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[dispatch_completed] messageId=${msg._id} mode=team lead=${lead.name} status=failed durationMs=${
          completedAt - startedAt
        } error=${errorMessage}`
      );
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_RESULT_KEY,
        value: {
          at: completedAt,
          messageId: msg._id,
          mode: "team",
          targetName: lead.name,
          targetAgentId: leadRuntimeId,
          specialistNames: specialists.map((agent) => agent.name),
          status: "failed",
          durationMs: completedAt - startedAt,
          error: errorMessage.slice(0, 1000),
        },
      });
      if (isPermanentDispatchError(errorMessage)) {
        await persistPermanentDispatchFailure({
          channel,
          messageId: msg._id,
          agentDbId: lead._id,
          agentName: lead.name,
          mode: "team",
          errorMessage,
        });
        continue;
      }
      throw error;
    }
  }
}

main().catch((error) => {
  console.error("Orchestrator fatal:", error);
  process.exit(1);
});
