import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
import os from "os";

dotenv.config({ path: ".env.local" });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const DEDUPE_KEY = "orchestrator:last_hq_message_id";

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

function routeAgentName(
  text: string,
  mentions: string[],
  knownAgentNames: string[]
): string {
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
  return [
    `You are ${agentName}, operating inside Mission Control.`,
    "You MUST report back through Mission Control scripts in this workspace.",
    `Use this command for chat replies: npx tsx scripts/report.ts chat ${agentName} "YOUR_MESSAGE"`,
    `Use this command for status updates: npx tsx scripts/report.ts heartbeat ${agentName} active "Working on X"`,
    "",
    "Task:",
    userMessage,
    "",
    "Requirements:",
    "1) Set your status to active first.",
    "2) Produce a concise useful reply for the team.",
    "3) Post the reply via scripts/report.ts chat.",
    "4) Set your status back to idle when done.",
  ].join("\n");
}

async function runOpenClawAgent(agentId: string, prompt: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = ["agent", "--agent", agentId, "--message", prompt, "--json"];
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

async function selectPendingMessages(channel: string, explicitId?: string) {
  const messages = await client.query(api.messages.list, { channel });
  const userMessages = messages.filter((m) => !m.agentId);

  if (explicitId) {
    return userMessages.filter((m) => m._id === explicitId);
  }

  const pointer = await client.query(api.settings.get, { key: DEDUPE_KEY });
  const lastSeen = (pointer?.value as string | undefined) ?? null;
  if (!lastSeen) return userMessages.slice(-1); // first run: only most recent

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
    console.log(`Routing message ${msg._id} -> ${target.name} (${targetAgentId})`);

    await client.mutation(api.agents.updateStatus, {
      id: target._id,
      status: "active",
      message: "Dispatched by orchestrator",
    });

    try {
      await runOpenClawAgent(targetAgentId, prompt);
    } finally {
      await client.mutation(api.agents.updateStatus, {
        id: target._id,
        status: "idle",
        message: "Awaiting next task",
      });
    }

    await client.mutation(api.settings.set, { key: DEDUPE_KEY, value: msg._id });
  }
}

main().catch((error) => {
  console.error("Orchestrator fatal:", error);
  process.exit(1);
});
