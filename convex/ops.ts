import { query } from "./_generated/server";

const LAST_REPORT_CHAT_KEY = "probe:last_report_chat_write";
const LAST_DISPATCH_RESULT_KEY = "probe:last_dispatch_result";
const LAST_DISPATCH_STARTED_KEY = "probe:last_dispatch_started";
const WATCHER_LEASE_KEY = "watcher:leader";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function parseLease(value: unknown) {
  const raw = toRecord(value);
  return {
    owner: typeof raw.owner === "string" && raw.owner ? raw.owner : null,
    expiresAt:
      typeof raw.expiresAt === "number" && Number.isFinite(raw.expiresAt) ? raw.expiresAt : 0,
  };
}

function recentCount(rows: Array<{ finishedAt?: number }>, cutoff: number) {
  return rows.filter((row) => typeof row.finishedAt === "number" && row.finishedAt >= cutoff).length;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;

    const [
      agents,
      pendingDispatches,
      runningDispatches,
      completedDispatches,
      failedDispatches,
      cancelledDispatches,
      undeliveredNotifications,
      lastDispatchStarted,
      lastDispatchResult,
      lastReportChat,
      watcherLease,
    ] = await Promise.all([
      ctx.db.query("agents").collect(),
      ctx.db
        .query("taskDispatches")
        .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("taskDispatches")
        .withIndex("by_status_requestedAt", (q) => q.eq("status", "running"))
        .collect(),
      ctx.db
        .query("taskDispatches")
        .withIndex("by_status_requestedAt", (q) => q.eq("status", "completed"))
        .order("desc")
        .take(250),
      ctx.db
        .query("taskDispatches")
        .withIndex("by_status_requestedAt", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(250),
      ctx.db
        .query("taskDispatches")
        .withIndex("by_status_requestedAt", (q) => q.eq("status", "cancelled"))
        .order("desc")
        .take(250),
      ctx.db
        .query("notifications")
        .withIndex("by_delivered", (q) => q.eq("delivered", false))
        .take(500),
      ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", LAST_DISPATCH_STARTED_KEY))
        .first(),
      ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", LAST_DISPATCH_RESULT_KEY))
        .first(),
      ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", LAST_REPORT_CHAT_KEY))
        .first(),
      ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", WATCHER_LEASE_KEY))
        .first(),
    ]);

    const lease = parseLease(watcherLease?.value);
    const activeAgents = agents.filter((agent) => agent.status === "active").length;
    const blockedAgents = agents.filter((agent) => agent.status === "blocked").length;

    return {
      now,
      agents: {
        total: agents.length,
        active: activeAgents,
        blocked: blockedAgents,
        idle: Math.max(0, agents.length - activeAgents - blockedAgents),
      },
      dispatch: {
        pending: pendingDispatches.length,
        running: runningDispatches.length,
        recent24h: {
          completed: recentCount(completedDispatches, cutoff),
          failed: recentCount(failedDispatches, cutoff),
          cancelled: recentCount(cancelledDispatches, cutoff),
        },
        lastStarted: lastDispatchStarted?.value ?? null,
        lastResult: lastDispatchResult?.value ?? null,
      },
      notifications: {
        undelivered: undeliveredNotifications.length,
      },
      reports: {
        lastReportChat: lastReportChat?.value ?? null,
      },
      watcher: {
        owner: lease.owner,
        expiresAt: lease.expiresAt,
        isHealthy: !!lease.owner && lease.expiresAt > now,
        msUntilExpiry: lease.expiresAt > now ? lease.expiresAt - now : 0,
      },
    };
  },
});

