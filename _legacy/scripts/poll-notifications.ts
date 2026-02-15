import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import os from "os";
import { loadMissionControlEnv, parseOpenClawJsonOutput } from "./lib/mission-control";

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
const OPENCLAW_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.NOTIFICATION_OPENCLAW_TIMEOUT_MS || 45000)
);
const SESSION_LOCK_BACKOFF_BASE_MS = Math.max(
  2000,
  Number(process.env.NOTIFICATION_SESSION_LOCK_BACKOFF_BASE_MS || 15000)
);
const SESSION_LOCK_BACKOFF_MAX_MS = Math.max(
  SESSION_LOCK_BACKOFF_BASE_MS,
  Number(process.env.NOTIFICATION_SESSION_LOCK_BACKOFF_MAX_MS || 180000)
);
const RUN_ONCE = process.env.RUN_ONCE === "1";

const client = new ConvexHttpClient(convexUrl);
let lastAutomationRefreshAt = 0;
let notificationDeliveryEnabled = true;
let notificationBatchSize = Math.max(1, DEFAULT_BATCH_SIZE);
let lastDeliveryDisabledLogAt = 0;
const sessionRetryAt = new Map<string, number>();
const sessionLockFailures = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, max = 240) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

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

async function runOpenClaw(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (IS_WINDOWS && child.pid) {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
          shell: false,
        });
        killer.on("error", () => child.kill());
      } else {
        child.kill("SIGKILL");
      }
    }, OPENCLAW_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(
            `openclaw timeout after ${OPENCLAW_TIMEOUT_MS}ms; args=${args.join(
              " "
            )}; stderr=${truncate(stderr)}`
          )
        );
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || stdout || `openclaw exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isTransientOpenClawError(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("session file locked") ||
    text.includes(".jsonl.lock") ||
    text.includes("lane wait exceeded") ||
    text.includes("failovererror") ||
    text.includes("gateway timeout") ||
    text.includes("timeout 10000ms") ||
    text.includes("temporarily unavailable")
  );
}

function setSessionBackoff(sessionKey: string) {
  const failures = (sessionLockFailures.get(sessionKey) ?? 0) + 1;
  sessionLockFailures.set(sessionKey, failures);
  const backoff = Math.min(SESSION_LOCK_BACKOFF_BASE_MS * failures, SESSION_LOCK_BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 1000);
  const retryAt = Date.now() + backoff + jitter;
  sessionRetryAt.set(sessionKey, retryAt);
  return { failures, retryAt, backoff: backoff + jitter };
}

function clearSessionBackoff(sessionKey: string) {
  sessionLockFailures.delete(sessionKey);
  sessionRetryAt.delete(sessionKey);
}

async function sendToOpenClaw(
  sessionKey: string,
  message: string,
  sessionMap: Map<string, string>
): Promise<void> {
  const sessionId = sessionMap.get(sessionKey) ?? null;
  const agentId = resolveAgentId(sessionKey);

  const attempts = sessionId
    ? [
        ["agent", "--session-id", sessionId, "--message", message, "--json"],
        ["agent", "--agent", agentId, "--message", message, "--json"],
      ]
    : [["agent", "--agent", agentId, "--message", message, "--json"]];

  let lastError: Error | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const args = attempts[i];
    try {
      await runOpenClawJson(args);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      const canRetry = i + 1 < attempts.length && isTransientOpenClawError(message);
      if (!canRetry) {
        break;
      }
      await sleep(800);
    }
  }

  throw lastError ?? new Error("Unknown OpenClaw notification delivery error");
}

async function runOpenClawJson<T>(args: string[]): Promise<T> {
  const { stdout, stderr } = await runOpenClaw(args);
  const candidates = [stdout, stderr, `${stdout}\n${stderr}`];
  for (const candidate of candidates) {
    const text = candidate.trim();
    if (!text) continue;
    try {
      return parseOpenClawJsonOutput<T>(text);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(
    `Failed to parse JSON from openclaw args=${args.join(" ")} stdout=${truncate(
      stdout
    )} stderr=${truncate(stderr)}`
  );
}

async function getSessionMap(): Promise<Map<string, string>> {
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
    return sessionMap;
  } catch {
    return sessionMap;
  }
}

function trimDeliveryMessage(message: string, maxChars = 320): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

async function refreshAutomationConfig(now: number) {
  if (now - lastAutomationRefreshAt < AUTOMATION_REFRESH_MS) return;
  lastAutomationRefreshAt = now;

  try {
    const config = await client.query(api.settings.getAutomationConfig);
    notificationDeliveryEnabled = config.notificationDeliveryEnabled;
    notificationBatchSize = Math.max(1, config.notificationBatchSize);
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
  const now = Date.now();
  await refreshAutomationConfig(now);
  if (!notificationDeliveryEnabled) {
    if (now - lastDeliveryDisabledLogAt >= 30000) {
      console.log("[poll] notification delivery disabled by automation config");
      lastDeliveryDisabledLogAt = now;
    }
    return;
  }

  const sessionMap = await getSessionMap();
  const undelivered = await client.query(api.notifications.getUndelivered, {
    limit: notificationBatchSize,
  });
  console.log(
    `[poll] undelivered=${undelivered.length} sessions=${sessionMap.size} batch=${notificationBatchSize}`
  );
  if (undelivered.length === 0) return;

  const processedSessions = new Set<string>();
  for (const notification of undelivered) {
    const agent = await client.query(api.agents.get, { id: notification.targetAgentId });
    if (!agent) {
      await client.mutation(api.notifications.markAttemptFailed, {
        id: notification._id,
        error: `Agent not found: ${notification.targetAgentId}`,
      });
      continue;
    }

    const sessionKey = agent.sessionKey;
    if (processedSessions.has(sessionKey)) continue;
    const retryAt = sessionRetryAt.get(sessionKey) ?? 0;
    if (retryAt > now) continue;

    processedSessions.add(sessionKey);
    try {
      const deliveryMessage = trimDeliveryMessage(notification.content);
      await sendToOpenClaw(sessionKey, deliveryMessage, sessionMap);
      clearSessionBackoff(sessionKey);
      await client.mutation(api.notifications.markDelivered, { id: notification._id });
      console.log(
        `[delivered] ${agent.name} (${sessionKey}) <- ${deliveryMessage.slice(0, 80)}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isTransientOpenClawError(errorMessage)) {
        const backoff = setSessionBackoff(sessionKey);
        console.warn(
          `[backoff] ${agent.name} (${sessionKey}) transient lock; retry in ${Math.ceil(
            backoff.backoff / 1000
          )}s: ${truncate(errorMessage, 200)}`
        );
        continue;
      }
      await client.mutation(api.notifications.markAttemptFailed, {
        id: notification._id,
        error: errorMessage,
      });
      clearSessionBackoff(sessionKey);
      console.error(
        `[retry] ${agent.name} (${sessionKey}) delivery failed: ${errorMessage}`
      );
    }
  }
}

async function main() {
  console.log(`Notification daemon started. polling=${POLL_INTERVAL_MS}ms bin=${OPENCLAW_BIN}`);

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error("Notification daemon loop error:", error);
    }
    if (RUN_ONCE) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error("Notification daemon fatal:", error);
  process.exit(1);
});
