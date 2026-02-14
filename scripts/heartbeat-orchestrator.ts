import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import {
  buildTsxCommand,
  loadMissionControlEnv,
  resolveMissionControlRoot,
  resolveScriptPath,
} from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const client = new ConvexHttpClient(convexUrl);
const reportScriptCommand = buildTsxCommand("report.ts");
const TSX_CLI_PATH = path.join(resolveMissionControlRoot(), "node_modules", "tsx", "dist", "cli.mjs");
const HEARTBEAT_AGENT_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.HEARTBEAT_AGENT_TIMEOUT_MS || 120000)
);
const HEARTBEAT_NOTIFICATION_MAX_AGE_MS = Math.max(
  0,
  Number(process.env.HEARTBEAT_NOTIFICATION_MAX_AGE_MS || 6 * 60 * 60 * 1000)
);
const ACTIONABLE_TASK_STATUSES = new Set(["inbox", "assigned", "in_progress", "testing", "blocked"]);
const DEFAULT_HEARTBEAT_CONFIG = {
  heartbeatEnabled: true,
  heartbeatMaxNotifications: 3,
  heartbeatMaxTasks: 3,
  heartbeatMaxActivities: 4,
  heartbeatRequireChatUpdate: false,
};

function truncate(value: string, max = 280) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let agent = "";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--agent" && args[i + 1]) {
      agent = args[i + 1];
      i += 1;
    }
  }
  if (!agent) {
    throw new Error(
      `Usage: ${buildTsxCommand("heartbeat-orchestrator.ts", ["--agent", "<openclaw-agent-id>"])}`
    );
  }
  return { agent };
}

function sessionKeyFromAgentId(agentId: string) {
  if (agentId === "main") return "agent:motoko:main";
  return `agent:${agentId}:main`;
}

function formatTasks(tasks: Array<{ title: string; status: string; priority: string }>, limit: number) {
  if (tasks.length === 0) return "no active tasks";
  return `${tasks.length} active task(s)`;
}

function formatNotifications(notifications: Array<{ content: string }>, limit: number) {
  if (notifications.length === 0) return "no pending notifications";
  return `${notifications.length} pending notification(s)`;
}

function formatActivity(activities: Array<{ message: string }>, limit: number) {
  if (activities.length === 0) return "no recent team activity";
  return `${activities.length} recent team activities`;
}

async function getHeartbeatConfig() {
  try {
    const config = await client.query(api.settings.getAutomationConfig);
    return {
      heartbeatEnabled: config.heartbeatEnabled,
      heartbeatMaxNotifications: config.heartbeatMaxNotifications,
      heartbeatMaxTasks: config.heartbeatMaxTasks,
      heartbeatMaxActivities: config.heartbeatMaxActivities,
      heartbeatRequireChatUpdate: config.heartbeatRequireChatUpdate,
    };
  } catch {
    return { ...DEFAULT_HEARTBEAT_CONFIG };
  }
}

async function runOpenClawAgent(agentId: string, prompt: string): Promise<void> {
  const invokeScriptPath = resolveScriptPath("invoke-agent.ts");
  if (!existsSync(TSX_CLI_PATH)) {
    throw new Error(`tsx cli not found at ${TSX_CLI_PATH}`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI_PATH, invokeScriptPath, "--agent", agentId, "--message", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
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
        killer.on("error", () => {
          child.kill();
        });
      } else {
        child.kill("SIGKILL");
      }
    }, HEARTBEAT_AGENT_TIMEOUT_MS);

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
            `invoke-agent.ts timed out after ${HEARTBEAT_AGENT_TIMEOUT_MS}ms; stdout="${truncate(
              stdout
            )}" stderr="${truncate(stderr)}"`
          )
        );
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `invoke-agent.ts exited with code ${code}; stdout="${truncate(stdout)}" stderr="${truncate(
              stderr
            )}"`
          )
        );
      }
    });
  });
}

async function main() {
  const { agent: openclawAgentId } = parseArgs();
  const heartbeatConfig = await getHeartbeatConfig();
  if (!heartbeatConfig.heartbeatEnabled) {
    console.log(`[heartbeat] disabled by automation config for ${openclawAgentId}`);
    return;
  }

  const expectedSessionKey = sessionKeyFromAgentId(openclawAgentId);
  const agents = await client.query(api.agents.list);
  const convexAgent =
    agents.find((a) => a.sessionKey === expectedSessionKey) ||
    ((openclawAgentId === "main" || openclawAgentId === "motoko")
      ? agents.find((a) => a.name === "Motoko")
      : undefined);

  if (!convexAgent) {
    throw new Error(`No Convex agent maps to OpenClaw id "${openclawAgentId}"`);
  }

  const rawNotifications = await client.query(api.notifications.getForAgent, {
    agentId: convexAgent._id,
    includeDelivered: false,
  });
  const now = Date.now();
  const staleNotifications = HEARTBEAT_NOTIFICATION_MAX_AGE_MS
    ? rawNotifications.filter((n) => now - n.createdAt > HEARTBEAT_NOTIFICATION_MAX_AGE_MS)
    : [];
  for (const notification of staleNotifications) {
    await client.mutation(api.notifications.markDelivered, { id: notification._id });
  }
  const pendingNotifications = HEARTBEAT_NOTIFICATION_MAX_AGE_MS
    ? rawNotifications.filter((n) => now - n.createdAt <= HEARTBEAT_NOTIFICATION_MAX_AGE_MS)
    : rawNotifications;

  const assignedTasks = await client.query(api.tasks.getAssigned, { agentId: convexAgent._id });
  const activeTasks = assignedTasks.filter((t) => ACTIONABLE_TASK_STATUSES.has(t.status));
  const activityLimit = Math.max(1, heartbeatConfig.heartbeatMaxActivities);
  const activities = await client.query(api.activities.recent, { limit: activityLimit });

  if (pendingNotifications.length === 0 && activeTasks.length === 0) {
    await client.mutation(api.agents.updateStatus, {
      id: convexAgent._id,
      status: "idle",
      message: "HEARTBEAT_OK",
    });
    console.log(`[heartbeat] ${convexAgent.name}: HEARTBEAT_OK`);
    return;
  }

  const prompt = [
    `You are ${convexAgent.name} (${convexAgent.role}) on scheduled Mission Control heartbeat.`,
    `Pending notifications: ${formatNotifications(
      pendingNotifications,
      heartbeatConfig.heartbeatMaxNotifications
    ).replace(/\s+/g, " ").trim()}.`,
    `Assigned tasks: ${formatTasks(activeTasks, heartbeatConfig.heartbeatMaxTasks)
      .replace(/\s+/g, " ")
      .trim()}.`,
    `Recent team activity: ${formatActivity(activities, heartbeatConfig.heartbeatMaxActivities)
      .replace(/\s+/g, " ")
      .trim()}.`,
    `Protocol: (1) ${reportScriptCommand} heartbeat ${convexAgent.name} active "Processing heartbeat work";`,
    "(2) work relevant items;",
    heartbeatConfig.heartbeatRequireChatUpdate
      ? `(3) post at least one concrete update via ${reportScriptCommand} chat ${convexAgent.name} "<update>";`
      : `(3) if you completed meaningful work, post a chat update; otherwise, do not post a chat update;`,
    `if needed update tasks via Convex CLI;`,
    `(4) finish with ${reportScriptCommand} heartbeat ${convexAgent.name} idle "Heartbeat complete".`,
    "Execution environment is Windows PowerShell.",
    "Use PowerShell-compatible commands only (example: Get-ChildItem -Force), not Bash flags like ls -F.",
    "Do not output NO_REPLY. If blocked, state blocker and owner. If report command fails, include full error and retry once.",
  ].join(" ");

  await client.mutation(api.agents.updateStatus, {
    id: convexAgent._id,
    status: "active",
    message: "Heartbeat dispatch",
  });

  try {
    await runOpenClawAgent(openclawAgentId, prompt);
    for (const notification of pendingNotifications) {
      await client.mutation(api.notifications.markDelivered, { id: notification._id });
    }
  } catch (error) {
    await client.mutation(api.agents.updateStatus, {
      id: convexAgent._id,
      status: "blocked",
      message: `Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  } finally {
    await client.mutation(api.agents.updateStatus, {
      id: convexAgent._id,
      status: "idle",
      message: "Awaiting next heartbeat",
    });
  }
}

main().catch((error) => {
  console.error("Heartbeat orchestrator fatal:", error);
  process.exit(1);
});
