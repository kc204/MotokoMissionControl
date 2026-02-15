import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadMissionControlEnv } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);

async function main() {
  console.log("🔍 Debugging HQ Chat Messages...");
  
  // List messages via the API first
  const hqMessages = await client.query(api.messages.list, { channel: "hq" });
  console.log(`✅ api.messages.list({ channel: "hq" }) returned ${hqMessages.length} messages.`);
  
  if (hqMessages.length > 0) {
    console.log("Last message via API:", JSON.stringify(hqMessages[hqMessages.length-1], null, 2));
  }

  // Now inspect raw structure if we can (we can't query raw tables from client, only via functions)
  // But we can check if there are messages with OTHER channels.
  
  // Let's trying listing other channels just in case
  const capitalHQ = await client.query(api.messages.list, { channel: "HQ" });
  if (capitalHQ.length > 0) {
      console.warn(`⚠️ FOUND ${capitalHQ.length} messages in 'HQ' (uppercase)! This is the bug.`);
  }

  const undefinedChannel = await client.query(api.messages.list, { channel: "" });
    if (undefinedChannel.length > 0) {
      console.warn(`⚠️ FOUND ${undefinedChannel.length} messages with empty channel!`);
  }
}

main().catch(console.error);
