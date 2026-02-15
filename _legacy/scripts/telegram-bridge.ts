// scripts/telegram-bridge.ts
// Relays Mission Control (HQ) messages to Telegram

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { exec } from "child_process";
import { promisify } from "util";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const execAsync = promisify(exec);
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Configuration
const TELEGRAM_CHANNEL_ID = "-1003754633913"; // Your Group ID
const TELEGRAM_TOPIC_ID = "1";               // Your Topic ID

console.log("🌉 Telegram Bridge Active: Listening for HQ updates...");

let lastCheckTime = Date.now();

// Polling Interval
setInterval(async () => {
  try {
    await checkHQ();
  } catch (error) {
    console.error("Bridge Error:", error);
  }
}, 5000); // Check every 5 seconds

async function checkHQ() {
  // Fetch recent messages
  // We assume api.messages.list returns sorted by newest first
  const messages = await client.query(api.messages.list, { channel: "hq" });
  
  // Filter for NEW messages from AGENTS (ignore user/system to prevent loops)
  const newMessages = messages.filter(m => 
    m.createdAt > lastCheckTime && 
    m.agentId // Only forward agent messages
  );

  if (newMessages.length === 0) return;

  // Update watermark
  lastCheckTime = newMessages[0].createdAt;

  // Process oldest to newest
  for (const msg of newMessages.reverse()) {
    await forwardToTelegram(msg);
  }
}

async function forwardToTelegram(msg: any) {
  const agentName = msg.agent?.name || "Agent";
  const text = msg.text;
  
  console.log(`📤 Forwarding: [${agentName}] ${text}`);

  // Construct CLI command
  // Escaping quotes is important
  const safeText = `🤖 *${agentName}*: ${text}`.replace(/"/g, '\\"');
  
  // We use the 'message' tool via 'openclaw message send' (assuming CLI has this)
  // Or simpler: just use 'openclaw message send'
  
  const cmd = `openclaw message send --channel telegram --to "${TELEGRAM_CHANNEL_ID}" --topic "${TELEGRAM_TOPIC_ID}" --message "${safeText}"`;
  
  try {
    await execAsync(cmd);
  } catch (e: any) {
    console.error(`❌ Failed to send to Telegram: ${e.message}`);
  }
}
