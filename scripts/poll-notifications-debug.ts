import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import os from "os";
import { loadMissionControlEnv } from "./lib/mission-control";

console.log("DEBUG: Script started");

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN =
  process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const POLL_INTERVAL_MS = Number(process.env.NOTIFICATION_POLL_MS || 2000);
const DEFAULT_BATCH_SIZE = Number(process.env.NOTIFICATION_BATCH_SIZE || 10);
const AUTOMATION_REFRESH_MS = Number(process.env.AUTOMATION_REFRESH_MS || 5000);
const RUN_ONCE = process.env.RUN_ONCE === "1";

console.log(`DEBUG: RUN_ONCE is set to ${RUN_ONCE}`);

const client = new ConvexHttpClient(convexUrl);
let lastAutomationRefreshAt = 0;
let notificationDeliveryEnabled = true;
let notificationBatchSize = Math.max(1, DEFAULT_BATCH_SIZE);
let lastDeliveryDisabledLogAt = 0;

function spawnOpenClaw(args: string[]) {
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", OPENCLAW_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(OPENCLAW_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

async function sendToOpenClaw(
  sessionKey: string,
  message: string,
  sessionMap: Map<string, string>
): Promise<void> {
  console.log(`DEBUG: Entering sendToOpenClaw for sessionKey: ${sessionKey}`);
  const sessionId = sessionMap.get(sessionKey) ?? null;
  const agentId = resolveAgentId(sessionKey);

  const args = sessionId
    ? ["agent", "--session-id", sessionId, "--message", message, "--json"]
    : ["agent", "--agent", agentId, "--message", message, "--json"];

  await new Promise<void>((resolve, reject) => {
    const child = spawnOpenClaw(args);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`DEBUG: sendToOpenClaw for ${sessionKey} completed successfully`);
        resolve();
        return;
      }
      reject(new Error(stderr || `openclaw exited with code ${code}; args=${args.join(" ")}`));
    });
  });
  console.log(`DEBUG: Exiting sendToOpenClaw for sessionKey: ${sessionKey}`);
}

async function runOpenClawJson<T>(args: string[]): Promise<T> {
  console.log("DEBUG: Entering runOpenClawJson");
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
        const result = JSON.parse(stdout) as T;
        console.log("DEBUG: runOpenClawJson completed successfully");
        resolve(result);
      } catch {
        reject(new Error(`Failed to parse JSON from openclaw: ${stdout || stderr}`));
      }
    });
  });
}

async function getSessionMap(): Promise<Map<string, string>> {
  console.log("DEBUG: Entering getSessionMap");
  const sessionMap = new Map<string, string>();
  try {
    const data = await runOpenClawJson<{ sessions?: Array<{ key?: string; sessionId?: string }> }>([
      "sessions",
      "--json",
    ]);
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    for (const session of sessions) {
      if (session?.key && session?.sessionId) {
        sessionMap.set(session.key, session.sessionId);
      }
    }
    console.log(`DEBUG: getSessionMap found ${sessionMap.size} sessions`);
    return sessionMap;
  } catch(e) {
    console.error("DEBUG: Error in getSessionMap:", e);
    return sessionMap;
  }
}

function trimDeliveryMessage(message: string, maxChars = 320): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

async function refreshAutomationConfig(now: number) {
  console.log("DEBUG: Entering refreshAutomationConfig");
  if (now - lastAutomationRefreshAt < AUTOMATION_REFRESH_MS) {
    console.log("DEBUG: Skipping refreshAutomationConfig (too recent)");
    return;
  }
  lastAutomationRefreshAt = now;

  try {
    const config = await client.query(api.settings.getAutomationConfig);
    notificationDeliveryEnabled = config.notificationDeliveryEnabled;
    notificationBatchSize = Math.max(1, config.notificationBatchSize);
    console.log("DEBUG: refreshAutomationConfig completed successfully");
  } catch (error) {
    console.error("[automation] failed to load config, using previous notification settings:", error);
  }
}

function resolveAgentId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return "main";
}

async function runOnce() {
  console.log("DEBUG: Entering runOnce");
  const now = Date.now();
  await refreshAutomationConfig(now);
  if (!notificationDeliveryEnabled) {
    if (now - lastDeliveryDisabledLogAt >= 30000) {
      console.log("[poll] notification delivery disabled by automation config");
      lastDeliveryDisabledLogAt = now;
    }
    console.log("DEBUG: Exiting runOnce (delivery disabled)");
    return;
  }

  const sessionMap = await getSessionMap();
  const undelivered = await client.query(api.notifications.getUndelivered, {
    limit: notificationBatchSize,
  });
  console.log(
    `[poll] undelivered=${undelivered.length} sessions=${sessionMap.size} batch=${notificationBatchSize}`
  );
  if (undelivered.length === 0) {
    console.log("DEBUG: Exiting runOnce (no undelivered notifications)");
    return;
  }

  for (const notification of undelivered) {
    console.log(`DEBUG: Processing notification ${notification._id}`);
    const agent = await client.query(api.agents.get, { id: notification.targetAgentId });
    if (!agent) {
      await client.mutation(api.notifications.markAttemptFailed, {
        id: notification._id,
        error: `Agent not found: ${notification.targetAgentId}`,
      });
      continue;
    }

    try {
      const deliveryMessage = trimDeliveryMessage(notification.content);
      await sendToOpenClaw(agent.sessionKey, deliveryMessage, sessionMap);
      await client.mutation(api.notifications.markDelivered, { id: notification._id });
      console.log(
        `[delivered] ${agent.name} (${agent.sessionKey}) <- ${deliveryMessage.slice(0, 80)}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await client.mutation(api.notifications.markAttemptFailed, {
        id: notification._id,
        error: errorMessage,
      });
      console.error(
        `[retry] ${agent.name} (${agent.sessionKey}) delivery failed: ${errorMessage}`
      );
    }
  }
  console.log("DEBUG: Exiting runOnce (finished processing)");
}

async function main() {
  console.log(`Notification daemon started. polling=${POLL_INTERVAL_MS}ms bin=${OPENCLAW_BIN}`);

  while (true) {
    try {
      console.log("DEBUG: Loop start");
      await runOnce();
      console.log("DEBUG: Loop end");
    } catch (error) {
      console.error("Notification daemon loop error:", error);
    }
    if (RUN_ONCE) {
      console.log("DEBUG: RUN_ONCE is true, breaking loop.");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.log("DEBUG: Exiting main function");
}

main().catch((error) => {
  console.error("Notification daemon fatal:", error);
  process.exit(1);
});
console.log("DEBUG: Script end");
