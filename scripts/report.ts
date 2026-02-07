// scripts/report.ts
// Usage:
//   Heartbeat: npx tsx scripts/report.ts heartbeat <agentName> <status> [message]
//   Task:      npx tsx scripts/report.ts task <agentName> <title> <status> [description]
//   Chat:      npx tsx scripts/report.ts chat <agentName> <message>

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function main() {
  const [action, agentName, ...args] = process.argv.slice(2);

  if (!action || !agentName) {
    console.error("Usage: npx tsx scripts/report.ts <action> <agentName> ...");
    process.exit(1);
  }

  const agent = await client.query(api.agents.getByName, { name: agentName });
  if (!agent) {
    console.error(`Agent not found: ${agentName}`);
    process.exit(1);
  }

  switch (action) {
    case "heartbeat": {
      const [status, ...msgParts] = args;
      await client.mutation(api.agents.updateStatus, {
        id: agent._id,
        status: (status as "idle" | "active" | "blocked") || "active",
        message: msgParts.join(" "),
      });
      console.log(`Heartbeat sent: ${status}`);
      break;
    }

    case "chat": {
      const message = args.join(" ");
      await client.mutation(api.messages.send, {
        channel: "hq",
        text: message,
        agentId: agent._id,
      });
      console.log(`Chat sent: "${message}"`);
      break;
    }

    case "task": {
      const [title, status, ...descParts] = args;
      const description = descParts.join(" ") || "Created from report script";
      const taskId = await client.mutation(api.tasks.create, {
        title: title || "Untitled task",
        description,
        priority: "medium",
        status:
          (status as
            | "inbox"
            | "assigned"
            | "in_progress"
            | "review"
            | "done"
            | "blocked") || "inbox",
        createdBy: agentName,
      });
      console.log(`Task created: "${title}" (${taskId})`);
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
  }
}

main().catch(console.error);
