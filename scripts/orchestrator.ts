import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import os from "os";
import { buildTsxCommand, loadMissionControlEnv } from "./lib/mission-control";

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

const client = new ConvexHttpClient(convexUrl);

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

function buildPrompt(agentName: string, userMessage: string) {
  const cleanTask = userMessage.replace(/\s+/g, " ").trim();
  return [
    `You are ${agentName} operating inside Mission Control.`,
    `Task from HQ: ${cleanTask}`,
    `Do in order: (1) ${reportScriptPath} heartbeat ${agentName} active \"Working on HQ task\";`,
    `(2) perform the task;`,
    `(3) post your actual answer via ${reportScriptPath} chat ${agentName} \"YOUR_FINAL_ANSWER\";`,
    `(4) ${reportScriptPath} heartbeat ${agentName} idle \"Task complete\".`,
    "Your final answer must be plain text, specific, and non-empty.",
    "Do not output NO_REPLY. If a report command fails, include full error and retry once.",
  ].join(" ");
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

async function getActiveAuthProfile() {
  const active = await client.query(api.auth.getActive);
  if (!active) return null;
  const provider =
    (typeof active.provider === "string" && active.provider) ||
    active.profileId.split(":")[0] ||
    "";
  if (!provider) return null;
  return { provider, profileId: active.profileId };
}

async function ensureAgentRuntimeConfig(agentRuntimeId: string, thinkingModel: string) {
  const activeAuth = await getActiveAuthProfile();
  if (activeAuth) {
    await runOpenClawAgentCommand([
      "models",
      "auth",
      "order",
      "set",
      "--provider",
      activeAuth.provider,
      "--agent",
      agentRuntimeId,
      activeAuth.profileId,
    ]);
  }

  await runOpenClawAgentCommand(["models", "--agent", agentRuntimeId, "set", thinkingModel]);
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

async function runOpenClawAgent(agentId: string, prompt: string): Promise<OpenClawRunResult> {
  return await new Promise<OpenClawRunResult>((resolve, reject) => {
    const args = ["agent", "--agent", agentId, "--message", prompt, "--json"];
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
          const parsed = JSON.parse(stdout);
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
  thinkingModel: string;
  prompt: string;
}) {
  await ensureAgentRuntimeConfig(args.agentRuntimeId, args.thinkingModel);

  const before = await getLatestAgentMessageInChannel(args.channel, args.agentDbId);
  let result: OpenClawRunResult;
  try {
    result = await runOpenClawAgent(args.agentRuntimeId, args.prompt);
  } catch (firstError) {
    const hasReply = await waitForAgentReply({
      channel: args.channel,
      agentDbId: args.agentDbId,
      beforeMessageId: before?._id ?? null,
      timeoutMs: 3000,
      intervalMs: 300,
    });
    if (hasReply) {
      const firstErrorMessage = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(
        `[dispatch_retry_skip] agent=${args.agentRuntimeId} reason=${firstErrorMessage} reply=already_persisted`
      );
      return;
    }
    const firstErrorMessage = firstError instanceof Error ? firstError.message : String(firstError);
    console.error(`[dispatch_retry] agent=${args.agentRuntimeId} reason=${firstErrorMessage}`);
    result = await runOpenClawAgent(args.agentRuntimeId, args.prompt);
  }

  await ensureHqReplyPersisted({
    channel: args.channel,
    agentDbId: args.agentDbId,
    agentName: args.agentName,
    beforeMessageId: before?._id ?? null,
    assistantText: result.assistantText,
  });
}

async function selectPendingMessages(channel: string, explicitId?: string) {
  const messages = await client.query(api.messages.list, { channel });
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

async function main() {
  const { channel, onceMessageId } = parseArgs();
  const pending = await selectPendingMessages(channel, onceMessageId);
  if (pending.length === 0) {
    console.log("No pending HQ user messages.");
    return;
  }

  const agents = await client.query(api.agents.list);
  const names = agents.map((a) => a.name);

  for (const msg of pending) {
    const text = msg.text || msg.content || "";
    const mentions = msg.mentions ?? [];
    const targetName = routeAgentName(text, mentions, names);
    const target = agents.find((a) => a.name === targetName) ?? agents.find((a) => a.name === "Motoko");
    if (!target) {
      console.error(`Cannot route message ${msg._id}: no target agent found`);
      continue;
    }

    const targetAgentId = agentIdFromSessionKey(target.sessionKey);
    const prompt = buildPrompt(target.name, text);
    const startedAt = Date.now();
    console.log(`[dispatch_started] messageId=${msg._id} target=${target.name} agentId=${targetAgentId}`);
    await client.mutation(api.settings.set, {
      key: LAST_DISPATCH_STARTED_KEY,
      value: {
        at: startedAt,
        messageId: msg._id,
        targetName: target.name,
        targetAgentId,
      },
    });

    await client.mutation(api.agents.updateStatus, {
      id: target._id,
      status: "active",
      message: "Dispatched by orchestrator",
    });

    try {
      await runOpenClawAndEnsureReply({
        channel,
        agentDbId: target._id,
        agentName: target.name,
        agentRuntimeId: targetAgentId,
        thinkingModel: target.models.thinking,
        prompt,
      });
      const completedAt = Date.now();
      console.log(
        `[dispatch_completed] messageId=${msg._id} target=${target.name} status=success durationMs=${
          completedAt - startedAt
        }`
      );
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_RESULT_KEY,
        value: {
          at: completedAt,
          messageId: msg._id,
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
        `[dispatch_completed] messageId=${msg._id} target=${target.name} status=failed durationMs=${
          completedAt - startedAt
        } error=${errorMessage}`
      );
      await client.mutation(api.settings.set, {
        key: LAST_DISPATCH_RESULT_KEY,
        value: {
          at: completedAt,
          messageId: msg._id,
          targetName: target.name,
          targetAgentId,
          status: "failed",
          durationMs: completedAt - startedAt,
          error: errorMessage.slice(0, 1000),
        },
      });
      throw error;
    } finally {
      await client.mutation(api.agents.updateStatus, {
        id: target._id,
        status: "idle",
        message: "Awaiting next task",
      });
    }
  }
}

main().catch((error) => {
  console.error("Orchestrator fatal:", error);
  process.exit(1);
});
