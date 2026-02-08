// scripts/orchestrator.ts
// The "Bridge" between Convex (Mission Control) and OpenClaw execution.
// Replaces the simulated Hive Mind.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { exec } from "child_process";
import { promisify } from "util";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Fix env path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env.local");

dotenv.config({ path: envPath });

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  console.error("❌ ERROR: NEXT_PUBLIC_CONVEX_URL not found in", envPath);
  process.exit(1);
}

const execAsync = promisify(exec);
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

  // 1. Check for pending chat messages (directed at agents)
  await checkChat();
}

async function checkChat() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;

  // messages are returned oldest -> newest by the API wrapper usually?
  // Let's assume the API returns [oldest, ..., newest] based on my previous check.
  const newestMsg = messages[messages.length - 1];

  // If the last message is from an agent, we're done (they replied).
  if (newestMsg.agentId) return; 

  // It's a user message. Routing logic:
  const text = newestMsg.text.toLowerCase();
  const targets = new Set<string>();

  if (text.includes("@motoko") || text.includes("motoko")) targets.add("Motoko");
  if (text.includes("@recon") || text.includes("research")) targets.add("Recon");
  if (text.includes("@quill") || text.includes("write")) targets.add("Quill");
  if (text.includes("@forge") || text.includes("code")) targets.add("Forge");
  if (text.includes("@pulse") || text.includes("monitor")) targets.add("Pulse");
  
  // If "team" or "everyone" is mentioned, add everyone
  if (text.includes("team") || text.includes("everyone") || text.includes("all agents")) {
    targets.add("Motoko");
    targets.add("Recon");
    targets.add("Quill");
    targets.add("Forge");
    targets.add("Pulse");
  }

  // Default to Motoko if no specific target found
  if (targets.size === 0) targets.add("Motoko");

  console.log(`📨 New message detected. Routing to: ${Array.from(targets).join(", ")}...`);
  
  for (const agent of targets) {
    const prompt = `New message in HQ from User: "${newestMsg.text}".
    
    Please reply to the team by running this command:
    npx tsx scripts/report.ts chat ${agent} "YOUR_RESPONSE_HERE"
    
    Keep it short and in-character.`;

    // Spawn in parallel
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
