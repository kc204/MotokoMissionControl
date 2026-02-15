// scripts/heartbeat.ts
// Usage: npx tsx scripts/heartbeat.ts <agentName> <status> <message>

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function main() {
  const [agentName, status, ...messageParts] = process.argv.slice(2);
  const message = messageParts.join(" ");

  if (!agentName || !status) {
    console.error("Usage: npx tsx scripts/heartbeat.ts <agentName> <status> [message]");
    process.exit(1);
  }

  // Find agent ID
  const agent = await client.query(api.agents.getByName, { name: agentName });

  if (!agent) {
    console.error(`Agent not found: ${agentName}`);
    process.exit(1);
  }

  // Update status
  await client.mutation(api.agents.updateStatus, {
    id: agent._id,
    status: status as "idle" | "active" | "blocked",
    message: message || undefined,
  });

  console.log(`✅ Heartbeat sent for ${agentName}: ${status}`);
}

main().catch(console.error);
