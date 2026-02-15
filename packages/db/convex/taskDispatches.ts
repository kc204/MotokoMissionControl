import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const dispatchStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

export const hasPending = query({
  args: {},
  handler: async (ctx) => {
    const next = await ctx.db
      .query("taskDispatches")
      .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
      .order("desc")
      .first();
    return !!next;
  },
});

export const enqueue = mutation({
  args: {
    taskId: v.id("tasks"),
    targetAgentId: v.optional(v.id("agents")),
    requestedBy: v.string(),
    prompt: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("taskDispatches")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!)
        )
        .first();
      if (existing) return existing._id;
    }

    return await ctx.db.insert("taskDispatches", {
      taskId: args.taskId,
      targetAgentId: args.targetAgentId,
      requestedBy: args.requestedBy,
      prompt: args.prompt,
      idempotencyKey: args.idempotencyKey,
      status: "pending",
      runner: undefined,
      runId: undefined,
      resultPreview: undefined,
      verificationStatus: "not_run",
      verificationSummary: undefined,
      verificationCommand: undefined,
      error: undefined,
      requestedAt: now,
      startedAt: undefined,
      finishedAt: undefined,
    });
  },
});

export const claimNext = mutation({
  args: {
    runnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const next = await ctx.db
      .query("taskDispatches")
      .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();

    if (!next) return null;

    const now = Date.now();
    await ctx.db.patch(next._id, {
      status: "running",
      runner: args.runnerId,
      startedAt: now,
    });

    const task = await ctx.db.get(next.taskId);
    if (task && (task.status === "inbox" || task.status === "assigned")) {
      await ctx.db.patch(task._id, {
        status: "in_progress",
        startedAt: task.startedAt ?? now,
        updatedAt: now,
      });
    }

    const targetAgentId =
      next.targetAgentId ??
      (task?.assigneeIds?.length ? task.assigneeIds[0] : undefined);
    const targetAgent = targetAgentId ? await ctx.db.get(targetAgentId) : null;

    await ctx.db.insert("activities", {
      type: "dispatch_started",
      taskId: next.taskId,
      agentId: targetAgentId,
      message: `Dispatch started${targetAgent ? `: ${targetAgent.name}` : ""}`,
      createdAt: now,
    });

    return {
      dispatchId: next._id,
      taskId: next.taskId,
      prompt: next.prompt ?? null,
      targetAgentId: targetAgentId ?? null,
      targetSessionKey: targetAgent?.sessionKey ?? null,
      taskTitle: task?.title ?? null,
      taskDescription: task?.description ?? null,
    };
  },
});

export const claimForTask = mutation({
  args: {
    runnerId: v.string(),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("taskDispatches")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();

    const next = rows
      .filter((row) => row.status === "pending")
      .sort((a, b) => a.requestedAt - b.requestedAt)[0];

    if (!next) return null;

    const now = Date.now();
    await ctx.db.patch(next._id, {
      status: "running",
      runner: args.runnerId,
      startedAt: now,
    });

    const task = await ctx.db.get(next.taskId);
    if (task && (task.status === "inbox" || task.status === "assigned")) {
      await ctx.db.patch(task._id, {
        status: "in_progress",
        startedAt: task.startedAt ?? now,
        updatedAt: now,
      });
    }

    const targetAgentId =
      next.targetAgentId ??
      (task?.assigneeIds?.length ? task.assigneeIds[0] : undefined);
    const targetAgent = targetAgentId ? await ctx.db.get(targetAgentId) : null;

    await ctx.db.insert("activities", {
      type: "dispatch_started",
      taskId: next.taskId,
      agentId: targetAgentId,
      message: `Dispatch started${targetAgent ? `: ${targetAgent.name}` : ""}`,
      createdAt: now,
    });

    return {
      dispatchId: next._id,
      taskId: next.taskId,
      prompt: next.prompt ?? null,
      targetAgentId: targetAgentId ?? null,
      targetSessionKey: targetAgent?.sessionKey ?? null,
      taskTitle: task?.title ?? null,
      taskDescription: task?.description ?? null,
    };
  },
});

export const complete = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
    runId: v.optional(v.string()),
    resultPreview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.get(args.dispatchId);
    if (!existing) return;

    await ctx.db.patch(args.dispatchId, {
      status: "completed",
      runId: args.runId,
      resultPreview: args.resultPreview,
      finishedAt: now,
      error: undefined,
    });

    await ctx.db.insert("activities", {
      type: "dispatch_completed",
      taskId: existing.taskId,
      agentId: existing.targetAgentId,
      message: "Dispatch completed",
      createdAt: now,
    });
  },
});

export const fail = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.get(args.dispatchId);
    if (!existing) return;

    await ctx.db.patch(args.dispatchId, {
      status: "failed",
      error: args.error.slice(0, 5000),
      finishedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "dispatch_completed",
      taskId: existing.taskId,
      agentId: existing.targetAgentId,
      message: "Dispatch failed",
      metadata: { error: args.error.slice(0, 500) },
      createdAt: now,
    });
  },
});

export const cancel = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.dispatchId, {
      status: "cancelled",
      finishedAt: now,
    });
  },
});

export const cancelForTask = mutation({
  args: {
    taskId: v.id("tasks"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("taskDispatches")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();

    const active = rows.filter((row) => row.status === "pending" || row.status === "running");
    if (active.length === 0) {
      return { cancelled: 0 };
    }

    const reason =
      args.reason?.trim() || `Stopped manually at ${new Date(now).toISOString()}`;

    for (const row of active) {
      await ctx.db.patch(row._id, {
        status: "cancelled",
        error: reason,
        finishedAt: now,
      });
    }

    await ctx.db.insert("activities", {
      type: "dispatch_completed",
      taskId: args.taskId,
      message: `Cancelled ${active.length} active dispatch lane(s)`,
      createdAt: now,
    });

    return { cancelled: active.length };
  },
});

export const get = query({
  args: { dispatchId: v.id("taskDispatches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.dispatchId);
  },
});

export const listForTask = query({
  args: { taskId: v.id("tasks"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const limit = Math.max(1, Math.min(200, args.limit ?? 20));
      return await ctx.db
        .query("taskDispatches")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .order("desc")
        .take(limit);
    } catch (error) {
      console.error("listForTask failed", error);
      return [];
    }
  },
});

export const setStatus = mutation({
  args: { dispatchId: v.id("taskDispatches"), status: dispatchStatus },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dispatchId, { status: args.status });
  },
});
