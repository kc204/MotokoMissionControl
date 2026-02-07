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
const POLL_MS = Number(process.env.WATCHER_POLL_MS || 1000);
const MODEL_SYNC_MS = Number(process.env.WATCHER_MODEL_SYNC_MS || 60000);
const AUTH_SYNC_MS = Number(process.env.WATCHER_AUTH_SYNC_MS || 30000);
const MANUAL_DISPATCH_KEY = "orchestrator:manual_dispatch";

const client = new ConvexHttpClient(convexUrl);
const modelCache = new Map<string, string>();
let activeAuthProfile: string | null = null;
let orchestratorBusy = false;
let lastModelSyncAt = 0;
let lastAuthSyncAt = 0;
let lastSeenUserMessageId: string | null = null;
let lastManualDispatchToken: string | null = null;

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

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return "main";
}

async function syncModels() {
  const agents = await client.query(api.agents.list);
  for (const agent of agents) {
    const key = agent.name;
    const desired = agent.models.thinking;
    const lastKnown = modelCache.get(key);
    if (lastKnown === desired) continue;

    const openclawAgentId = agentIdFromSessionKey(agent.sessionKey);
    try {
      await runOpenClaw(["models", "--agent", openclawAgentId, "set", desired]);
      modelCache.set(key, desired);
      console.log(`[model] ${agent.name} -> ${desired}`);
    } catch (error) {
      console.error(`[model] failed for ${agent.name}:`, error);
    }
  }
}

async function syncAuthProfile() {
  const active = await client.query(api.auth.getActive);
  if (!active) return;
  if (active.profileId === activeAuthProfile) return;

  const agents = await client.query(api.agents.list);
  for (const agent of agents) {
    const openclawAgentId = agentIdFromSessionKey(agent.sessionKey);
    try {
      await runOpenClaw([
        "models",
        "auth",
        "order",
        "set",
        "--agent",
        openclawAgentId,
        active.profileId,
      ]);
    } catch (error) {
      console.error(`[auth] failed for ${agent.name}:`, error);
    }
  }

  activeAuthProfile = active.profileId;
  console.log(`[auth] active profile set to ${active.profileId}`);
}

async function triggerOrchestrator(messageId?: string) {
  if (orchestratorBusy) return;
  orchestratorBusy = true;
  try {
    const orchestratorArgs = ["./node_modules/tsx/dist/cli.mjs", "scripts/orchestrator.ts"];
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
  } finally {
    orchestratorBusy = false;
  }
}

async function checkAndDispatchNewUserMessage() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;
  const newestUserMessage = [...messages].reverse().find((m) => !m.agentId);
  if (!newestUserMessage) return;
  if (newestUserMessage._id === lastSeenUserMessageId) return;

  lastSeenUserMessageId = newestUserMessage._id;
  console.log(`[dispatch] new HQ user message ${newestUserMessage._id}`);
  await triggerOrchestrator(newestUserMessage._id);
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
  await checkAndDispatchNewUserMessage();
  await checkManualDispatchRequest();

  const now = Date.now();
  if (now - lastModelSyncAt >= MODEL_SYNC_MS) {
    await syncModels();
    lastModelSyncAt = now;
  }

  if (now - lastAuthSyncAt >= AUTH_SYNC_MS) {
    await syncAuthProfile();
    lastAuthSyncAt = now;
  }
}

async function main() {
  console.log(`Watcher active. poll=${POLL_MS}ms`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("Watcher loop error:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error("Watcher fatal:", error);
  process.exit(1);
});
