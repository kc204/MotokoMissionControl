// scripts/hive-mind.ts
// The "Brain" that powers agent interactions in Mission Control

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Use the key we found in configuration (Google Gemini)
// In production, this should be in .env.local
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "AIzaSyCZb-gMt20CboWu5Rk-Ik8VW1fOF7vfJq0");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

console.log("🧠 Hive Mind Active: Agents are now listening...");

let lastProcessedTime = Date.now();

// Agents Persona Config
const AGENTS = {
  Motoko: "You are Motoko, the Team Lead. You coordinate the others (Recon, Quill, Forge, Pulse). You are sharp, decisive, and keep things moving. Keep replies short.",
  Recon: "You are Recon, the Researcher. You love digging up info. You are curious and detailed. Keep replies short.",
  Quill: "You are Quill, the Content Writer. You care about tone, SEO, and engagement. You are creative. Keep replies short.",
  Forge: "You are Forge, the Developer. You care about code quality, stack, and implementation. You are technical and direct. Keep replies short.",
  Pulse: "You are Pulse, the Analyst. You care about metrics, data, and performance. You are analytical. Keep replies short.",
};

async function main() {
  // Polling loop
  setInterval(async () => {
    try {
      await checkMessages();
    } catch (e) {
      console.error("Hive Error:", e);
    }
  }, 3000); // Check every 3 seconds
}

async function checkMessages() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  
  // Get new messages only
  const newMessages = messages.filter(m => m.createdAt > lastProcessedTime);
  
  if (newMessages.length === 0) return;

  // Update high watermark
  lastProcessedTime = newMessages[0].createdAt;

  // Process the most recent message (to avoid reply storms on startup)
  const latestMsg = newMessages[0];
  
  console.log(`📨 New Message: "${latestMsg.text}" from ${latestMsg.agent?.name || "User/System"}`);

  // Don't reply to self (Hive Mind agents)
  if (latestMsg.agentId && Object.keys(AGENTS).includes(latestMsg.agent?.name || "")) {
    // Small chance for inter-agent banter (20%)
    if (Math.random() > 0.2) return; 
  }

  // DECIDE WHO SHOULD REPLY
  const responder = await decideResponder(latestMsg.text, latestMsg.agent?.name);
  
  if (responder) {
    console.log(`👉 Selected responder: ${responder}`);
    await generateAndReply(responder, latestMsg.text);
  }
}

async function decideResponder(text: string, senderName?: string): Promise<string | null> {
  const lowerText = text.toLowerCase();
  
  // Explicit mentions
  if (lowerText.includes("@motoko")) return "Motoko";
  if (lowerText.includes("@recon")) return "Recon";
  if (lowerText.includes("@quill")) return "Quill";
  if (lowerText.includes("@forge")) return "Forge";
  if (lowerText.includes("@pulse")) return "Pulse";

  // Contextual Triggers
  if (lowerText.includes("research") || lowerText.includes("find") || lowerText.includes("search")) return "Recon";
  if (lowerText.includes("write") || lowerText.includes("blog") || lowerText.includes("content")) return "Quill";
  if (lowerText.includes("code") || lowerText.includes("deploy") || lowerText.includes("error") || lowerText.includes("fix")) return "Forge";
  if (lowerText.includes("data") || lowerText.includes("metric") || lowerText.includes("stats")) return "Pulse";
  if (lowerText.includes("plan") || lowerText.includes("status") || lowerText.includes("update")) return "Motoko";

  // If "User" speaks and no one specific is called, Motoko usually replies
  if (!senderName) return "Motoko";

  return null;
}

async function generateAndReply(agentName: string, userMessage: string) {
  // Get Agent ID
  const agent = await client.query(api.agents.getByName, { name: agentName });
  if (!agent) return;

  // Set status to working
  await client.mutation(api.agents.updateStatus, { id: agent._id, status: "active", message: "Replying..." });

  // Generate AI Response
  const prompt = `${AGENTS[agentName as keyof typeof AGENTS]}\n\nUser/Colleague said: "${userMessage}"\n\nReply as ${agentName}:`;
  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Send Message
  await client.mutation(api.messages.send, {
    channel: "hq",
    text: response,
    agentId: agent._id,
  });

  // Set status back to idle/active
  await client.mutation(api.agents.updateStatus, { id: agent._id, status: "idle", message: "Listening" });
}

main().catch(console.error);
