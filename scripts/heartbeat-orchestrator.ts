import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import os from "os";
import { buildTsxCommand, loadMissionControlEnv } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const client = new ConvexHttpClient(convexUrl);
const reportScriptCommand = buildTsxCommand("report.ts");
const DEFAULT_HEARTBEAT_CONFIG = {
  heartbeatEnabled: true,
  heartbeatMaxNotifications: 3,
  heartbeatMaxTasks: 3,
  heartbeatMaxActivities: 4,
  heartbeatRequireChatUpdate: false,
};

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
  return `agent:${agentId}:main`;
}

function formatTasks(tasks: Array<{ title: string; status: string; priority: string }>, limit: number) {
  if (tasks.length === 0) return "- none";
  return tasks
    .slice(0, limit)
    .map((t, i) => `${i + 1}. [${t.status}|${t.priority}] ${t.title}`)
    .join("\n");
}

function formatNotifications(notifications: Array<{ content: string }>, limit: number) {
  if (notifications.length === 0) return "- none";
  return notifications.slice(0, limit).map((n, i) => `${i + 1}. ${n.content}`).join("\n");
}

function formatActivity(activities: Array<{ message: string }>, limit: number) {
  if (activities.length === 0) return "- none";
  return activities.slice(0, limit).map((a, i) => `${i + 1}. ${a.message}`).join("\n");
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
  await new Promise<void>((resolve, reject) => {
    const child = spawnOpenClaw(["agent", "--agent", agentId, "--message", prompt, "--json"]);
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
    (openclawAgentId === "main" ? agents.find((a) => a.name === "Motoko") : undefined);

  if (!convexAgent) {
    throw new Error(`No Convex agent maps to OpenClaw id "${openclawAgentId}"`);
  }

  const pendingNotifications = await client.query(api.notifications.getForAgent, {
    agentId: convexAgent._id,
    includeDelivered: false,
  });
  const assignedTasks = await client.query(api.tasks.getAssigned, { agentId: convexAgent._id });
  const activeTasks = assignedTasks.filter((t) => t.status !== "done");
  const activityLimit = Math.max(8, heartbeatConfig.heartbeatMaxActivities * 2);
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
      : `(3) post a chat update only if you completed meaningful work; otherwise skip chat output;`,
    `if needed update tasks via Convex CLI;`,
    `(4) finish with ${reportScriptCommand} heartbeat ${convexAgent.name} idle "Heartbeat complete".`,
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
