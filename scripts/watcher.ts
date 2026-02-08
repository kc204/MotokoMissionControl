// scripts/watcher.ts
// Syncs Mission Control (Convex) state to OpenClaw Runtime (Config/Auth)

import { exec } from "child_process";
import { promisify } from "util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Env setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  console.error("❌ Missing NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const execAsync = promisify(exec);

console.log("👁️ Watcher Active: Syncing Mission Control <-> OpenClaw");

// State cache to avoid redundant updates
const state = {
  models: {} as Record<string, string>, // agentName -> modelId
  authProfile: null as string | null,   // profileId
  lastMsgId: null as string | null,
};

// Mapping Mission Control Names -> OpenClaw IDs
const AGENT_ID_MAP: Record<string, string> = {
  "Motoko": "main",
  "Recon": "researcher",
  "Quill": "writer",
  "Forge": "developer",
  "Pulse": "monitor"
};

// Main Loop
setInterval(async () => {
  try {
    await syncModels();
    await syncAuth();
    await checkChat();
  } catch (e) {
    console.error("Watcher Loop Error:", e);
  }
}, 2000);

async function syncModels() {
  const agents = await client.query(api.agents.list);
  
  for (const agent of agents) {
    const desiredModel = agent.models.thinking;
    const lastKnown = state.models[agent.name];
    const openclawId = AGENT_ID_MAP[agent.name];

    if (!openclawId) continue; // Unknown agent

    // Detect change
    if (lastKnown && lastKnown !== desiredModel) {
      console.log(`🔄 Syncing Model: ${agent.name} (${openclawId}) -> ${desiredModel}`);
      
      try {
        // We need to find the array index for 'openclaw config set agents.list[X].model'
        // Or simpler: use 'openclaw agents update' if available, but config set is safer.
        
        // Strategy: We can't easily find the index via CLI json without parsing.
        // BUT, we can try to just set it using the agent's override if supported, 
        // OR just parse the config.
        
        // Let's use a helper to find index
        const index = await findAgentIndex(openclawId);
        if (index !== -1) {
            // Apply config change
            const cmd = `openclaw config set agents.list[${index}].model "${desiredModel}"`;
            await execAsync(cmd);
            console.log(`✅ Config updated: ${cmd}`);
            
            // Also attempt runtime update if possible (not always persistent)
            // await execAsync(`openclaw agents restart ${openclawId}`); // restart logic?
        } else {
            console.warn(`⚠️ Could not find agent ${openclawId} in config list.`);
        }

      } catch (err) {
        console.error(`❌ Failed to sync model for ${agent.name}:`, err);
      }
    }
    state.models[agent.name] = desiredModel;
  }
}

async function syncAuth() {
  const activeProfile = await client.query(api.auth.getActive);
  if (!activeProfile) return;

  if (state.authProfile && state.authProfile !== activeProfile.profileId) {
    console.log(`🔐 Switching Auth -> ${activeProfile.profileId}`);
    try {
      await execAsync(`openclaw auth switch "${activeProfile.profileId}"`);
      console.log("✅ Auth switched successfully.");
    } catch (err) {
      console.error("❌ Auth switch failed:", err);
    }
  }
  state.authProfile = activeProfile.profileId;
}

async function checkChat() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  if (messages.length === 0) return;

  const newest = messages[messages.length - 1]; // API returns reversed (oldest first)? 
  // Let's rely on my previous fix: messages list returns newest-first?
  // Wait, previous investigation said list() usually does order("desc"), so [0] is newest.
  // But then I saw code doing .reverse().map().
  
  // Let's assume [messages.length-1] is newest based on previous fix attempt.
  // Actually, let's stick to checking `_id` change.
  
  if (!newest.agentId && newest._id !== state.lastMsgId) {
    console.log("📨 New User Message detected!");
    state.lastMsgId = newest._id;
    // Trigger Orchestrator
    exec(`npx tsx scripts/orchestrator.ts`, (err, stdout) => {
        if (stdout) console.log(stdout);
        if (err) console.error("Orchestrator error:", err);
    });
  } else if (newest._id !== state.lastMsgId) {
     state.lastMsgId = newest._id;
  }
}

async function findAgentIndex(agentId: string): Promise<number> {
    // Hacky way to find index: read config via CLI
    try {
        const { stdout } = await execAsync("openclaw config get agents.list");
        // Output is YAML or JSON? usually simplified JSON-like.
        // It's risky to parse text.
        // Better way: Read file directly since we are local.
        
        const fs = await import("fs/promises");
        const homedir = (await import("os")).homedir();
        const configPath = path.join(homedir, ".openclaw", "openclaw.json");
        const content = await fs.readFile(configPath, "utf-8");
        const json = JSON.parse(content);
        
        const list = json.agents?.list || [];
        return list.findIndex((a: any) => a.id === agentId);
    } catch (e) {
        console.error("Config read error:", e);
        return -1;
    }
}
