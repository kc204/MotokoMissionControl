// scripts/report.ts
// Usage:
//   Heartbeat: npx tsx scripts/report.ts heartbeat <agentName> <status> [message]
//   Task:      npx tsx scripts/report.ts task <agentName> <title> <status> [description]
//   Chat:      npx tsx scripts/report.ts chat <agentName> <message>

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadMissionControlEnv } from "./lib/mission-control";

loadMissionControlEnv();

const PROBE_LAST_REPORT_CHAT_KEY = "probe:last_report_chat_write";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);

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
      const messageId = await client.mutation(api.messages.send, {
        channel: "hq",
        text: message,
        agentId: agent._id,
      });
      const now = Date.now();
      await client.mutation(api.settings.set, {
        key: PROBE_LAST_REPORT_CHAT_KEY,
        value: {
          at: now,
          agentName,
          messageId,
          preview: message.slice(0, 180),
        },
      });
      console.log(
        `[report_write_confirmed] channel=hq messageId=${messageId} agent=${agentName} at=${now}`
      );
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

    case "list-tasks": {
      const tasks = await client.query(api.tasks.getAssigned, { agentId: agent._id });
      console.log(JSON.stringify(tasks, null, 2));
      break;
    }

    case "get-task": {
      const [taskId] = args;
      // @ts-ignore
      const task = await client.query(api.tasks.get, { id: taskId });
      console.log(JSON.stringify(task, null, 2));
      break;
    }

    case "update-task-status": {
      const [taskId, status] = args;
      // @ts-ignore
      await client.mutation(api.tasks.updateStatus, { id: taskId, status });
      console.log(`Task ${taskId} status updated to ${status}`);
      break;
    }

    case "list-messages": {
      const [channel] = args;
      const targetChannel = channel === "hq" ? "hq" : `task:${channel}`;
      // @ts-ignore
      const messages = await client.query(api.messages.list, { channel: targetChannel });
      console.log(JSON.stringify(messages, null, 2));
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
  }
}

main().catch(console.error);
