// scripts/orchestrator.ts
// The "Bridge" between Convex (Mission Control) and OpenClaw execution.
// Replaces the simulated Hive Mind.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { exec } from "child_process";
import { promisify } from "util";
import { loadMissionControlEnv, buildTsxCommand } from "./lib/mission-control";

loadMissionControlEnv();

const execAsync = promisify(exec);
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

  // Routing logic...
  const text = newestMsg.text.toLowerCase();
  const targets = new Set<string>();

  if (text.includes("@motoko") || text.includes("motoko")) targets.add("Motoko");
  if (text.includes("@recon") || text.includes("research")) targets.add("Recon");
  if (text.includes("@quill") || text.includes("write")) targets.add("Quill");
  if (text.includes("@forge") || text.includes("code")) targets.add("Forge");
  if (text.includes("@pulse") || text.includes("monitor")) targets.add("Pulse");
  
  if (text.includes("team") || text.includes("everyone") || text.includes("all agents")) {
    targets.add("Motoko"); targets.add("Recon"); targets.add("Quill"); targets.add("Forge"); targets.add("Pulse");
  }

  if (targets.size === 0) targets.add("Motoko");

  console.log(`📨 New message detected. Routing to: ${Array.from(targets).join(", ")}...`);
  
  for (const agent of targets) {
    // Use buildTsxCommand for reliable absolute paths
    const reportCmd = buildTsxCommand("report.ts", ["chat", agent, "YOUR_RESPONSE_HERE"]);
    
    // We need to escape quotes carefully for the prompt
    // The prompt is passed to --task "..."
    // The reportCmd contains quotes (e.g. C:\Users\...) which might break nested quotes.
    
    // Simplified prompt construction
    const prompt = `You are ${agent}, an AI agent in Mission Control.
    
    CONTEXT: A user sent a message in the "HQ" channel.
    MESSAGE: "${newestMsg.text}"
    
    INSTRUCTIONS:
    1. Read the message.
    2. To reply, RUN THIS COMMAND:
       ${reportCmd}
    
    3. If you need to see previous messages, run:
       npx tsx "${workDir}/scripts/report.ts" list-messages hq
    
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
