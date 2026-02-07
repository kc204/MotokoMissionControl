// scripts/watcher.ts
// Runs in background to sync Mission Control -> OpenClaw Config

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";

dotenv.config({ path: ".env.local" });

const execAsync = promisify(exec);
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

console.log("👁️ Mission Control Watcher active...");

// Cache to prevent loop updates
const localState: Record<string, string> = {};

// Polling interval (real-time subscriptions not available in Node client yet without polyfills)
setInterval(async () => {
  try {
    const agents = await client.query(api.agents.list);

    for (const agent of agents) {
      const currentModel = agent.models.thinking;
      const lastKnown = localState[agent.name];

      if (lastKnown && lastKnown !== currentModel) {
        console.log(`🔄 Syncing ${agent.name} to ${currentModel}...`);
        
        await syncToOpenClaw(agent.name, currentModel);
        
        // Notify dashboard (optional status update)
        // await client.mutation(api.agents.updateStatus, { id: agent._id, status: "active", message: "Configuring model..." });
      }

      localState[agent.name] = currentModel;
    }
  } catch (error) {
    console.error("Watcher error:", error);
  }
}, 2000);

async function syncToOpenClaw(agentName: string, modelId: string) {
  try {
    if (modelId === "codex-cli") {
      // Special case for Codex: It's a tool, not a model ID.
      // We might set the model to a cheap reasoning model but ENABLE the Codex tool.
      // For now, we'll just log it because OpenClaw config structure for "tools" is complex.
      console.log(`🛠️ Enabling Codex CLI for ${agentName} (Configuration required manually for now)`);
      
      // Example: openclaw config set agents.forge.tools.codex.enabled true
      // await execAsync(`openclaw config set agents.${agentName.toLowerCase()}.model.primary "google-antigravity/claude-opus-4-5-thinking"`);
    } else {
      // Standard Model Switch
      // In a multi-agent OpenClaw setup, we would target the specific agent config.
      // For now, assuming "Motoko" controls the main session model.
      
      if (agentName === "Motoko") {
        console.log(`🤖 Switching Main Agent to ${modelId}`);
        // This affects the GLOBAL default for now
        // await execAsync(`openclaw config set agents.defaults.model.primary "${modelId}"`);
      } else {
        console.log(`🤖 Switching ${agentName} to ${modelId}`);
        // await execAsync(`openclaw config set agents.overrides.${agentName.toLowerCase()}.model.primary "${modelId}"`);
      }
    }
  } catch (err) {
    console.error(`❌ Failed to sync ${agentName}:`, err);
  }
}
