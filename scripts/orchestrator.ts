// scripts/orchestrator.ts
// The "Bridge" between Convex (Mission Control) and OpenClaw execution.
// Replaces the simulated Hive Mind.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { exec } from "child_process";
import { loadMissionControlEnv, buildTsxCommand } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);

// Mapping: Convex Name -> OpenClaw Agent ID
const AGENT_MAP: Record<string, string> = {
  "Motoko": "main",
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
    // Use buildTsxCommand for reliable absolute paths
    const reportCmd = buildTsxCommand("report.ts", ["chat", agent, "YOUR_RESPONSE_HERE"]);
    const listCmd = buildTsxCommand("report.ts", ["list-messages", "hq"]);
    
    // We need to escape quotes carefully for the prompt
    // The prompt is passed to --task "..."
    // The reportCmd contains quotes (e.g. C:\Users\...) which might break nested quotes.
    
    // Simplified prompt construction
    const prompt = `You are ${agent}, an AI agent in Mission Control.
    
    CONTEXT: A user sent a message in the "HQ" channel.
    MESSAGE: "${messageText}"
    
    INSTRUCTIONS:
    1. Read the message.
    2. To reply, RUN THIS COMMAND:
       ${reportCmd}
    
    3. If you need to see previous messages, run:
       ${listCmd}
    
    DO NOT try to "browse" the channel. Use the CLI commands provided.`;

    spawnAgent(agent, prompt);
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

  // Spawn OpenClaw Session
  const safeInstruction = instruction.replace(/"/g, '\\"');
  
  try {
    const cmd = `openclaw sessions spawn --agent ${openclawId} --task "${safeInstruction}"`;
    console.log(`> ${cmd}`);
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) console.error(`Spawn error (${agentName}): ${error.message}`);
      if (stdout) console.log(`Spawn out (${agentName}): ${stdout}`);
    });

  } catch (e) {
    console.error("Spawn failed:", e);
  }
}

main().catch(console.error);
