import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const dispatchStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

function requiresPlanningApproval(task: {
  planningStatus?: "none" | "questions" | "ready" | "approved";
}) {
  return task.planningStatus === "questions" || task.planningStatus === "ready";
}

function targetKey(targetAgentId?: string | null) {
  return targetAgentId ?? "__default";
}

function truncate(value: string, max = 5000) {
  const compact = value.trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

async function insertAgentNotification(
  ctx: any,
  targetAgentId: string,
  content: string,
  sourceTaskId?: string
) {
  const now = Date.now();
  await ctx.db.insert("notifications", {
    targetAgentId,
    content,
    sourceTaskId,
    sourceMessageId: undefined,
    delivered: false,
    deliveredAt: undefined,
    error: undefined,
    attempts: 0,
    claimedBy: undefined,
    claimedAt: undefined,
    createdAt: now,
  });
}

async function claimDispatchRow(
  ctx: any,
  row: any,
  runnerId: string
) {
  const now = Date.now();
  const task = await ctx.db.get(row.taskId);
  if (!task) {
    await ctx.db.patch(row._id, {
      status: "failed",
      error: "Task not found",
      finishedAt: now,
    });
    return null;
  }

  if (task.status === "archived") {
    await ctx.db.patch(row._id, {
      status: "cancelled",
      error: "Task archived before dispatch",
      finishedAt: now,
    });
    return null;
  }

  if (requiresPlanningApproval(task)) {
    await ctx.db.patch(row._id, {
      status: "cancelled",
      error: "Planning must be approved before dispatch",
      finishedAt: now,
    });
    return null;
  }

  let selectedAgentId =
    row.targetAgentId ??
    (task.assigneeIds?.length ? task.assigneeIds[0] : undefined);
  let selectedAgent = selectedAgentId ? await ctx.db.get(selectedAgentId) : null;

  if (!selectedAgent) {
    selectedAgent =
      (await ctx.db
        .query("agents")
        .withIndex("by_name", (q: any) => q.eq("name", "Motoko"))
        .first()) ?? null;
    selectedAgentId = selectedAgent?._id;
  }

  if (!selectedAgent || !selectedAgent.sessionKey) {
    await ctx.db.patch(row._id, {
      status: "failed",
      error: "No target agent session available",
      finishedAt: now,
    });
    await ctx.db.insert("activities", {
      type: "dispatch_completed",
      taskId: task._id,
      message: `Dispatch failed for "${task.title}" (no target agent session)`,
      createdAt: now,
    });
    return null;
  }

  await ctx.db.patch(row._id, {
    status: "running",
    runner: runnerId,
    startedAt: now,
    finishedAt: undefined,
    error: undefined,
  });

  if (task.status !== "archived") {
    await ctx.db.patch(task._id, {
      status: "in_progress",
      startedAt: task.startedAt ?? now,
      completedAt: undefined,
      updatedAt: now,
    });
  }

  await ctx.db.insert("activities", {
    type: "dispatch_started",
    taskId: task._id,
    agentId: selectedAgentId,
    message: `Dispatch started: ${selectedAgent.name}`,
    createdAt: now,
  });

  const thread = await ctx.db
    .query("messages")
    .withIndex("by_taskId", (q: any) => q.eq("taskId", task._id))
    .order("desc")
    .take(8);
  const threadMessages = [...thread]
    .reverse()
    .map((msg) => ({
      fromUser: Boolean(msg.fromUser),
      text: (msg.content ?? "").trim(),
    }))
    .filter((msg) => msg.text.length > 0);

  return {
    dispatchId: row._id,
    taskId: row.taskId,
    prompt: row.prompt ?? null,
    targetAgentId: selectedAgentId ?? null,
    targetSessionKey: selectedAgent.sessionKey ?? null,
    taskTitle: task.title ?? null,
    taskDescription: task.description ?? null,
    taskPriority: task.priority ?? "medium",
    taskTags: task.tags ?? [],
    threadMessages,
  };
}

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
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    if (task.status === "archived") {
      throw new Error("Cannot dispatch an archived task");
    }
    if (requiresPlanningApproval(task)) {
      throw new Error("Planning must be approved before dispatch");
    }

    if (args.targetAgentId) {
      const target = await ctx.db.get(args.targetAgentId);
      if (!target) throw new Error("Target agent not found");
    }

    const now = Date.now();
    const requestedBy = args.requestedBy.trim() || "Mission Control";
    const normalizedPrompt = args.prompt?.trim() || undefined;
    const normalizedIdempotencyKey = args.idempotencyKey?.trim() || undefined;

    const targetIds = args.targetAgentId
      ? [args.targetAgentId]
      : task.assigneeIds.length > 0
        ? [...task.assigneeIds]
        : [undefined];

    const dedupTargets: Array<string | undefined> = [];
    const seenTargets = new Set<string>();
    for (const targetId of targetIds) {
      const key = targetKey(targetId as string | undefined);
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);
      dedupTargets.push(targetId as string | undefined);
    }

    const existingRows = await ctx.db
      .query("taskDispatches")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();

    const activeByTarget = new Map<string, string>();
    for (const row of existingRows) {
      if (row.status !== "pending" && row.status !== "running") continue;
      activeByTarget.set(targetKey(row.targetAgentId as string | undefined), row._id as string);
    }

    const createdIds: string[] = [];
    const reusedIds: string[] = [];

    for (const targetId of dedupTargets) {
      const key = targetKey(targetId);
      const active = activeByTarget.get(key);
      if (active) {
        reusedIds.push(active);
        continue;
      }

      const perTargetIdempotencyKey = normalizedIdempotencyKey
        ? `${normalizedIdempotencyKey}:${targetId ?? "default"}`
        : undefined;

      if (perTargetIdempotencyKey) {
        const existingByKey = await ctx.db
          .query("taskDispatches")
          .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", perTargetIdempotencyKey))
          .first();
        if (existingByKey) {
          reusedIds.push(existingByKey._id as string);
          continue;
        }
      }

      const createdId = await ctx.db.insert("taskDispatches", {
        taskId: args.taskId,
        targetAgentId: targetId as any,
        requestedBy,
        prompt: normalizedPrompt,
        idempotencyKey: perTargetIdempotencyKey,
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
      createdIds.push(createdId as string);
    }

    const dispatchId = createdIds[0] ?? reusedIds[0];
    if (!dispatchId) {
      throw new Error("No dispatch lane was queued");
    }

    if (createdIds.length > 0) {
      await ctx.db.patch(task._id, {
        status: "in_progress",
        startedAt: task.startedAt ?? now,
        completedAt: undefined,
        updatedAt: now,
      });

      if (normalizedPrompt) {
        await ctx.db.insert("messages", {
          taskId: task._id,
          fromAgentId: undefined,
          fromUser: true,
          content: normalizedPrompt,
          mentions: [],
          channel: `task:${task._id}`,
          metadata: undefined,
          createdAt: now,
        });
      }

      await ctx.db.insert("activities", {
        type: "dispatch_started",
        taskId: task._id,
        message:
          dedupTargets.length > 1
            ? `Dispatch queued for "${task.title}" (${createdIds.length}/${dedupTargets.length} lanes queued)`
            : `Dispatch queued for "${task.title}"`,
        createdAt: now,
      });
    }

    return dispatchId as any;
  },
});

export const claimNext = mutation({
  args: {
    runnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("taskDispatches")
      .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(20);
    if (pending.length === 0) return null;

    for (const row of pending) {
      const claim = await claimDispatchRow(ctx, row, args.runnerId);
      if (claim) return claim;
    }

    return null;
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
    return await claimDispatchRow(ctx, next, args.runnerId);
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
    const task = await ctx.db.get(existing.taskId);

    await ctx.db.patch(args.dispatchId, {
      status: "completed",
      runId: args.runId,
      resultPreview: args.resultPreview,
      finishedAt: now,
      error: undefined,
    });

    if (task) {
      const taskDispatches = await ctx.db
        .query("taskDispatches")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .collect();
      const remainingActiveLanes = taskDispatches.filter(
        (row) => row.status === "pending" || row.status === "running"
      ).length;

      if (task.status !== "archived") {
        const nextStatus =
          remainingActiveLanes > 0 ? "in_progress" : task.status === "done" ? "done" : "review";
        await ctx.db.patch(task._id, {
          status: nextStatus,
          openclawRunId: args.runId ?? task.openclawRunId,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(task._id, {
          openclawRunId: args.runId ?? task.openclawRunId,
          updatedAt: now,
        });
      }

      await ctx.db.insert("activities", {
        type: "dispatch_completed",
        taskId: existing.taskId,
        agentId: existing.targetAgentId,
        message:
          remainingActiveLanes > 0
            ? `Dispatch lane completed (${remainingActiveLanes} lane(s) still active)`
            : "Dispatch completed",
        createdAt: now,
      });
      return;
    }

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
    const task = await ctx.db.get(existing.taskId);
    const errorText = truncate(args.error, 1000);

    await ctx.db.patch(args.dispatchId, {
      status: "failed",
      error: errorText,
      finishedAt: now,
    });

    if (task) {
      const taskDispatches = await ctx.db
        .query("taskDispatches")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .collect();
      const remainingActiveLanes = taskDispatches.filter(
        (row) => row.status === "pending" || row.status === "running"
      ).length;

      if (task.status !== "archived") {
        await ctx.db.patch(task._id, {
          status: remainingActiveLanes > 0 ? "in_progress" : "blocked",
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(task._id, { updatedAt: now });
      }

      await ctx.db.insert("activities", {
        type: "dispatch_completed",
        taskId: existing.taskId,
        agentId: existing.targetAgentId,
        message:
          remainingActiveLanes > 0
            ? `Dispatch lane failed (${remainingActiveLanes} lane(s) still active)`
            : "Dispatch failed",
        metadata: { error: errorText },
        createdAt: now,
      });

      if (task.status !== "archived") {
        const notificationText =
          remainingActiveLanes > 0
            ? `A dispatch lane failed for "${task.title}": ${truncate(errorText, 240)}`
            : `Dispatch failed for "${task.title}": ${truncate(errorText, 240)}`;
        for (const assigneeId of task.assigneeIds) {
          await insertAgentNotification(
            ctx,
            assigneeId as string,
            notificationText,
            task._id as string
          );
        }
      }
      return;
    }

    await ctx.db.insert("activities", {
      type: "dispatch_completed",
      taskId: existing.taskId,
      agentId: existing.targetAgentId,
      message: "Dispatch failed",
      metadata: { error: truncate(errorText, 500) },
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
    const row = await ctx.db.get(args.dispatchId);
    if (!row) return;
    if (row.status === "completed" || row.status === "failed" || row.status === "cancelled") return;

    await ctx.db.patch(row._id, {
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

    const task = await ctx.db.get(args.taskId);
    if (task && task.status !== "archived" && (task.status === "in_progress" || task.status === "testing")) {
      await ctx.db.patch(task._id, {
        status: "review",
        updatedAt: now,
      });
    }

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
