import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadMissionControlEnv } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);

const LAST_REPORT_CHAT_KEY = "probe:last_report_chat_write";
const LAST_DISPATCH_RESULT_KEY = "probe:last_dispatch_result";
const LAST_DISPATCH_STARTED_KEY = "probe:last_dispatch_started";

async function main() {
  const [lastReportChat, lastDispatchResult, lastDispatchStarted, undelivered] = await Promise.all([
    client.query(api.settings.get, { key: LAST_REPORT_CHAT_KEY }),
    client.query(api.settings.get, { key: LAST_DISPATCH_RESULT_KEY }),
    client.query(api.settings.get, { key: LAST_DISPATCH_STARTED_KEY }),
    client.query(api.notifications.getUndelivered, { limit: 500 }),
  ]);

  const status = {
    now: new Date().toISOString(),
    report: lastReportChat?.value ?? null,
    dispatch: {
      started: lastDispatchStarted?.value ?? null,
      result: lastDispatchResult?.value ?? null,
    },
    notifications: {
      undeliveredCount: undelivered.length,
    },
  };

  console.log(JSON.stringify(status, null, 2));
}

main().catch((error) => {
  console.error("system-status fatal:", error);
  process.exit(1);
});
