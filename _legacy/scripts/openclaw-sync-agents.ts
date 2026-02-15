import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import path from "path";
import os from "os";
import { api } from "../convex/_generated/api";
import { normalizeModelId, parseOpenClawJsonOutput } from "./lib/mission-control";

dotenv.config({ path: ".env.local" });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN =
  process.env.OPENCLAW_BIN ||
  (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const WORKSPACE_ROOT =
  process.env.OPENCLAW_WORKSPACE_ROOT || path.join(os.homedir(), ".openclaw", "workspace");

const client = new ConvexHttpClient(convexUrl);

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

async function runOpenClawJson<T>(args: string[]): Promise<T> {
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
        reject(new Error(stderr || `openclaw exited with code ${code}; args=${args.join(" ")}`));
        return;
      }
      try {
        resolve(parseOpenClawJsonOutput<T>(stdout));
      } catch {
        reject(new Error(`Failed to parse JSON output for openclaw args=${args.join(" ")}`));
      }
    });
  });
}

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return "main";
}

async function main() {
  const convexAgents = await client.query(api.agents.list);
  const existing = await runOpenClawJson(["agents", "list", "--json"]);
  const existingIds = new Set((existing as Array<{ id: string }>).map((x) => x.id));

  for (const agent of convexAgents) {
    const agentId = agentIdFromSessionKey(agent.sessionKey);
    if (existingIds.has(agentId)) continue;

    const workspace =
      agentId === "main" ? WORKSPACE_ROOT : path.join(WORKSPACE_ROOT, agentId);
    const model = normalizeModelId(agent.models.thinking) || agent.models.thinking;
    const args = [
      "agents",
      "add",
      agentId,
      "--workspace",
      workspace,
      "--model",
      model,
      "--non-interactive",
      "--json",
    ];

    try {
      const result = await runOpenClawJson<{ id?: string }>(args);
      console.log(`[added] ${agentId} workspace=${workspace}`);
      if (result?.id) {
        existingIds.add(result.id);
      } else {
        existingIds.add(agentId);
      }
    } catch (error) {
      console.error(`[failed] ${agentId}:`, error);
    }
  }

  console.log("OpenClaw agent sync complete.");
}

main().catch((error) => {
  console.error("OpenClaw agent sync fatal:", error);
  process.exit(1);
});
