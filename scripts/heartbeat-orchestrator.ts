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
  let agent = "";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--agent" && args[i + 1]) {
      agent = args[i + 1];
      i += 1;
    }
  }
  if (!agent) {
    throw new Error("Usage: npx tsx scripts/heartbeat-orchestrator.ts --agent <openclaw-agent-id>");
  }
  return { agent };
}

function sessionKeyFromAgentId(agentId: string) {
  return `agent:${agentId}:main`;
}

function formatTasks(tasks: Array<{ title: string; status: string; priority: string }>) {
  if (tasks.length === 0) return "- none";
  return tasks
    .slice(0, 8)
    .map((t, i) => `${i + 1}. [${t.status}|${t.priority}] ${t.title}`)
    .join("\n");
}

function formatNotifications(notifications: Array<{ content: string }>) {
  if (notifications.length === 0) return "- none";
  return notifications.slice(0, 10).map((n, i) => `${i + 1}. ${n.content}`).join("\n");
}

function formatActivity(activities: Array<{ message: string }>) {
  if (activities.length === 0) return "- none";
  return activities.slice(0, 12).map((a, i) => `${i + 1}. ${a.message}`).join("\n");
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
  const activities = await client.query(api.activities.recent, { limit: 25 });

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
    `You are ${convexAgent.name} (${convexAgent.role}).`,
    "This is your scheduled Mission Control heartbeat.",
    "",
    "Pending notifications:",
    formatNotifications(pendingNotifications),
    "",
    "Assigned tasks:",
    formatTasks(activeTasks),
    "",
    "Recent team activity:",
    formatActivity(activities),
    "",
    "Execution protocol:",
    `1) Immediately run: npx tsx scripts/report.ts heartbeat ${convexAgent.name} active "Processing heartbeat work"`,
    "2) Work through notifications/tasks that match your role.",
    `3) Post at least one progress update via: npx tsx scripts/report.ts chat ${convexAgent.name} "..."`,
    `4) If you move task state, use Convex CLI (example): npx convex run tasks:updateStatus '{"id":"<taskId>","status":"in_progress"}'`,
    `5) End with: npx tsx scripts/report.ts heartbeat ${convexAgent.name} idle "Heartbeat complete"`,
    "If blocked, explicitly say what is missing and who is needed.",
  ].join("\n");

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
