// scripts/orchestrator.ts
// The "Bridge" between Convex (Mission Control) and OpenClaw execution.
// Replaces the simulated Hive Mind.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { spawn } from "child_process";
import os from "os";
import { loadMissionControlEnv, resolveScriptPath } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);
const IS_WINDOWS = os.platform() === "win32";

// Mapping: Convex Name -> OpenClaw Agent ID
const AGENT_MAP: Record<string, string> = {
  "Motoko": "motoko",
  "Recon": "researcher",
  "Quill": "writer",
  "Forge": "developer",
  "Pulse": "monitor"
};

const AGENT_MENTION_MAP: Record<string, string> = {
  motoko: "Motoko",
  main: "Motoko",
  recon: "Recon",
  researcher: "Recon",
  quill: "Quill",
  writer: "Quill",
  forge: "Forge",
  developer: "Forge",
  pulse: "Pulse",
  monitor: "Pulse",
};

function resolveMentionTargets(messageText: string): Set<string> {
  const targets = new Set<string>();
  const mentions = messageText.match(/@([a-zA-Z0-9_]+)/g) ?? [];

  for (const mention of mentions) {
    const tag = mention.slice(1).toLowerCase();
    if (tag === "all" || tag === "everyone" || tag === "team") {
      for (const agentName of Object.keys(AGENT_MAP)) targets.add(agentName);
      continue;
    }
    const mapped = AGENT_MENTION_MAP[tag];
    if (mapped) targets.add(mapped);
  }

  return targets;
}

async function main() {
  console.log("🎮 Orchestrator: Checking for work...");
  await checkChat();
}

async function checkChat() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;

  const newestMsg = messages[messages.length - 1];

  // If the last message is from an agent, we're done (they replied).
  if (newestMsg.agentId) return; 

  // Strict routing: only explicit @mentions trigger agent dispatch.
  const messageText = newestMsg.text ?? "";
  const targets = resolveMentionTargets(messageText);
  if (targets.size === 0) {
    console.log(`[dispatch] HQ message ${newestMsg._id} has no @mentions; skipping.`);
    return;
  }

  console.log(`📨 New message detected. Routing to: ${Array.from(targets).join(", ")}...`);
  
  for (const agent of targets) {
    // Pass raw user text only; invoke-agent.ts owns reply policy.
    spawnAgent(agent, messageText);
  }
}

async function spawnAgent(agentName: string, instruction: string) {
  const openclawId = AGENT_MAP[agentName];
  if (!openclawId) {
    console.error(`❌ Unknown agent: ${agentName}`);
    return;
  }

  console.log(`🚀 Spawning ${agentName} (${openclawId})...`);
  
  // Update status in Convex first
  const convexAgent = await client.query(api.agents.getByName, { name: agentName });
  if (convexAgent) {
     await client.mutation(api.agents.updateStatus, { 
       id: convexAgent._id, 
       status: "active", 
       message: "Processing request..." 
     });
  }

  const invokeScriptPath = resolveScriptPath("invoke-agent.ts");
  const tsxArgs = [
    "tsx",
    invokeScriptPath,
    "--agent",
    openclawId,
    "--convex-agent-name",
    agentName,
    "--message",
    instruction,
  ];

  try {
    console.log(
      `> npx tsx ${invokeScriptPath} --agent ${openclawId} --convex-agent-name "${agentName}" --message "<...>"`
    );
    const child = IS_WINDOWS
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npx", ...tsxArgs], {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        })
      : spawn("npx", tsxArgs, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`Spawn out (${agentName}): ${text}`);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.warn(`Spawn err (${agentName}): ${text}`);
    });
    child.on("error", (error) => console.error(`Spawn error (${agentName}): ${error.message}`));
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`Spawn exit (${agentName}): code=${code}`);
      }
    });
  } catch (e) {
    console.error("Spawn failed:", e);
  }
}

main().catch(console.error);
