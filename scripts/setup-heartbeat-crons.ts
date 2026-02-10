import { spawn } from "child_process";
import os from "os";
import { buildTsxCommand } from "./lib/mission-control";

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const TIMEZONE = process.env.HEARTBEAT_TZ || "UTC";
const HEARTBEAT_INTERVAL_MINUTES = Math.max(
  15,
  Number(process.env.HEARTBEAT_INTERVAL_MINUTES || 30)
);

type Job = {
  id: string;
  name: string;
  createdAtMs?: number;
  updatedAtMs?: number;
};

const SCHEDULES: Array<{ agentId: string; minuteOffset: number }> = [
  { agentId: "motoko", minuteOffset: 0 },
  { agentId: "developer", minuteOffset: 2 },
  { agentId: "writer", minuteOffset: 4 },
  { agentId: "researcher", minuteOffset: 8 },
  { agentId: "monitor", minuteOffset: 12 },
];
const HEARTBEAT_PREFIX = "mc-heartbeat-";

function spawnOpenClaw(args: string[]) {
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", OPENCLAW_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(OPENCLAW_BIN, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
}

async function runOpenClawJson(args: string[]): Promise<any> {
  return await new Promise((resolve, reject) => {
    const child = spawnOpenClaw([...args, "--timeout", "30000"]);
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
        reject(new Error(stderr || `openclaw exited with code ${code}; args=${args.join(" ")}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse JSON output for args=${args.join(" ")}`));
      }
    });
  });
}

async function runOpenClaw(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnOpenClaw([...args, "--timeout", "30000"]);
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
      reject(new Error(stderr || `openclaw exited with code ${code}; args=${args.join(" ")}`));
    });
  });
}

function cronExpr(offset: number): string {
  if (offset === 0) return `*/${HEARTBEAT_INTERVAL_MINUTES} * * * *`;
  return `${offset}-59/${HEARTBEAT_INTERVAL_MINUTES} * * * *`;
}

function heartbeatMessage(agentId: string) {
  const heartbeatCommand = buildTsxCommand("heartbeat-orchestrator.ts", ["--agent", agentId]);
  const reportCommand = buildTsxCommand("report.ts", [
    "chat",
    "Motoko",
    `HEARTBEAT_ERROR agent=${agentId} error=FULL_ERROR_OUTPUT`,
  ]);
  return `Mission Control heartbeat for ${agentId}. Run exactly this command now: ${heartbeatCommand}. If it fails, retry once. If it fails again, post the full error output with: ${reportCommand}.`;
}

async function main() {
  let jobs: Job[] = [];
  try {
    const existing = await runOpenClawJson(["cron", "list", "--json"]);
    jobs = Array.isArray(existing?.jobs) ? existing.jobs : [];
  } catch (error) {
    console.error("[cron:warn] unable to fetch existing jobs, continuing with best-effort add:", error);
  }
  const jobsByName = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = jobsByName.get(job.name) ?? [];
    list.push(job);
    jobsByName.set(job.name, list);
  }
  const byName = new Map<string, Job>();
  for (const [name, entries] of jobsByName) {
    const sorted = [...entries].sort((a, b) => {
      const aTs = a.updatedAtMs ?? a.createdAtMs ?? 0;
      const bTs = b.updatedAtMs ?? b.createdAtMs ?? 0;
      return bTs - aTs;
    });
    const keep = sorted[0];
    if (keep) byName.set(name, keep);
    const duplicates = sorted.slice(1);
    for (const duplicate of duplicates) {
      if (!duplicate.name.startsWith(HEARTBEAT_PREFIX)) continue;
      try {
        await runOpenClaw(["cron", "edit", duplicate.id, "--disable"]);
        console.log(`[cron:disable-duplicate] ${duplicate.name} (${duplicate.id})`);
      } catch (error) {
        console.error(`[cron:disable-duplicate:error] ${duplicate.name} (${duplicate.id}):`, error);
      }
    }
  }
  const desiredNames = new Set(SCHEDULES.map((schedule) => `mc-heartbeat-${schedule.agentId}`));

  for (const job of jobs) {
    if (!job.name.startsWith(HEARTBEAT_PREFIX)) continue;
    if (desiredNames.has(job.name)) continue;
    try {
      await runOpenClaw(["cron", "edit", job.id, "--disable"]);
      console.log(`[cron:disable] ${job.name}`);
    } catch (error) {
      console.error(`[cron:disable:error] ${job.name}:`, error);
    }
  }

  for (const schedule of SCHEDULES) {
    const name = `mc-heartbeat-${schedule.agentId}`;
    const cron = cronExpr(schedule.minuteOffset);
    const message = heartbeatMessage(schedule.agentId);
    const existingJob = byName.get(name);

    try {
      if (!existingJob) {
        const addArgs = [
          "cron",
          "add",
          "--name",
          name,
          "--agent",
          schedule.agentId,
          "--session",
          "isolated",
          "--cron",
          cron,
          "--tz",
          TIMEZONE,
          "--message",
          message,
        ];
        await runOpenClaw(addArgs);
        console.log(`[cron:add] ${name} (${cron})`);
        continue;
      }

      const editArgs = [
        "cron",
        "edit",
        existingJob.id,
        "--name",
        name,
        "--agent",
        schedule.agentId,
        "--session",
        "isolated",
        "--cron",
        cron,
        "--tz",
        TIMEZONE,
        "--message",
        message,
        "--enable",
      ];
      await runOpenClaw(editArgs);
      console.log(`[cron:edit] ${name} (${cron})`);
    } catch (error) {
      console.error(`[cron:error] ${name}:`, error);
    }
  }
}

main().catch((error) => {
  console.error("setup-heartbeat-crons fatal:", error);
  process.exit(1);
});
