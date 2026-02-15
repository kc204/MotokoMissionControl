import { spawn } from "child_process";
import * as dotenv from "dotenv";
import os from "os";

dotenv.config({ path: ".env.local" });

const isWindows = os.platform() === "win32";
const openclawBin = process.env.OPENCLAW_BIN || (isWindows ? "openclaw.cmd" : "openclaw");
const webhookUrl =
  process.env.MISSION_CONTROL_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_SITE_URL
    ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/openclaw/event`
    : "");
const webhookSecret = process.env.MISSION_CONTROL_WEBHOOK_SECRET;

if (!webhookUrl) {
  throw new Error(
    "MISSION_CONTROL_URL or NEXT_PUBLIC_CONVEX_SITE_URL is required to configure the hook."
  );
}

function spawnOpenclaw(args: string[]) {
  if (isWindows) {
    return spawn("cmd.exe", ["/d", "/s", "/c", openclawBin, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(openclawBin, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
}

async function runOpenclaw(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawnOpenclaw(args);
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
  const entry: Record<string, unknown> = {
    enabled: true,
    env: {
      MISSION_CONTROL_URL: webhookUrl,
    },
  };
  if (webhookSecret) {
    (entry.env as Record<string, string>).MISSION_CONTROL_WEBHOOK_SECRET = webhookSecret;
  }

  await runOpenclaw(["config", "set", "hooks.internal.enabled", "true", "--json"]);
  await runOpenclaw([
    "config",
    "set",
    "hooks.internal.entries.mission-control",
    JSON.stringify(entry),
    "--json",
  ]);

  console.log("Configured OpenClaw mission-control hook entry.");
  console.log(`MISSION_CONTROL_URL=${webhookUrl}`);
  if (webhookSecret) {
    console.log("MISSION_CONTROL_WEBHOOK_SECRET set.");
  } else {
    console.log("MISSION_CONTROL_WEBHOOK_SECRET not set (optional).");
  }
}

main().catch((error) => {
  console.error("configure-openclaw-hook fatal:", error);
  process.exit(1);
});
