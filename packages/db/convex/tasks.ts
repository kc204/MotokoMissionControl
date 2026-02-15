import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("testing"),
  v.literal("review"),
  v.literal("done"),
  v.literal("blocked"),
  v.literal("archived")
);

const taskPriority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent")
);

const planningStatus = v.union(
  v.literal("none"),
  v.literal("questions"),
  v.literal("ready"),
  v.literal("approved")
);

async function insertAssigneeNotification(
  ctx: any,
  targetAgentId: string,
  content: string,
  taskId: string
) {
  const now = Date.now();
  await ctx.db.insert("notifications", {
    targetAgentId,
    content,
    sourceTaskId: taskId,
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

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    status: v.optional(taskStatus),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, args.limit ?? 200));

    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }

    if (args.projectId) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("tasks")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    priority: v.optional(taskPriority),
    projectId: v.optional(v.id("projects")),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    squadId: v.optional(v.id("squads")),
    tags: v.optional(v.array(v.string())),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const assigneeIds = args.assigneeIds ?? [];
    const initialStatus = assigneeIds.length > 0 ? "assigned" : "inbox";
    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: initialStatus,
      priority: args.priority ?? "medium",
      projectId: args.projectId,
      assigneeIds,
      squadId: args.squadId,
      createdBy: args.createdBy ?? "user",
      tags: args.tags,
      workflowNodeId: undefined,
      sessionKey: undefined,
      openclawRunId: undefined,
      source: undefined,
      startedAt: undefined,
      lastEventAt: undefined,
      completedAt: undefined,
      planningStatus: "none",
      planningQuestions: [],
      planningDraft: "",
      metadata: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_created",
      taskId,
      message: args.title,
      createdAt: now,
    });

    for (const agentId of assigneeIds) {
      const existing = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", taskId).eq("agentId", agentId)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("taskSubscriptions", {
          taskId,
          agentId,
          reason: "assigned",
          createdAt: now,
        });
      }

      await insertAssigneeNotification(
        ctx,
        agentId as string,
        `New task assigned: "${args.title}"`,
        taskId as string
      );
    }

    return taskId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    priority: v.optional(taskPriority),
    projectId: v.optional(v.id("projects")),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    squadId: v.optional(v.id("squads")),
    tags: v.optional(v.array(v.string())),
    planningStatus: v.optional(planningStatus),
    planningQuestions: v.optional(v.array(v.string())),
    planningDraft: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;

    const now = Date.now();
    const nextAssigneeIds = args.assigneeIds ?? existing.assigneeIds;
    const currentAssignees = new Set((existing.assigneeIds ?? []).map(String));
    const nextAssignees = new Set((nextAssigneeIds ?? []).map(String));
    const addedAssigneeIds = Array.from(nextAssignees).filter((id) => !currentAssignees.has(id));

    let resolvedStatus = args.status;
    if (resolvedStatus === undefined && args.assigneeIds !== undefined) {
      if (nextAssigneeIds.length > 0 && existing.status === "inbox") {
        resolvedStatus = "assigned";
      } else if (nextAssigneeIds.length === 0 && existing.status === "assigned") {
        resolvedStatus = "inbox";
      }
    }

    const statusChanged = resolvedStatus !== undefined && resolvedStatus !== existing.status;

    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (resolvedStatus !== undefined) patch.status = resolvedStatus;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.assigneeIds !== undefined) patch.assigneeIds = nextAssigneeIds;
    if (args.squadId !== undefined) patch.squadId = args.squadId;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.planningStatus !== undefined) patch.planningStatus = args.planningStatus;
    if (args.planningQuestions !== undefined) patch.planningQuestions = args.planningQuestions;
    if (args.planningDraft !== undefined) patch.planningDraft = args.planningDraft;

    if (resolvedStatus === "done" && existing.completedAt == null) {
      patch.completedAt = now;
    }

    await ctx.db.patch(args.id, patch as any);

    for (const assigneeId of addedAssigneeIds) {
      const existingSub = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", args.id).eq("agentId", assigneeId as any)
        )
        .first();
      if (!existingSub) {
        await ctx.db.insert("taskSubscriptions", {
          taskId: args.id,
          agentId: assigneeId as any,
          reason: "assigned",
          createdAt: now,
        });
      }

      await insertAssigneeNotification(
        ctx,
        assigneeId,
        `You were assigned to "${existing.title}" by Mission Control.`,
        args.id as string
      );
    }

    if (statusChanged && resolvedStatus === "done") {
      await ctx.db.insert("activities", {
        type: "task_completed",
        taskId: args.id,
        message: existing.title,
        createdAt: now,
      });
      return;
    }

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: args.id,
      message: existing.title,
      createdAt: now,
    });
  },
});

export const getPlanning = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    return {
      taskId: task._id,
      planningStatus: task.planningStatus ?? "none",
      planningQuestions: task.planningQuestions ?? [],
      planningDraft: task.planningDraft ?? "",
    };
  },
});

export const getDispatchState = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    try {
      const dispatches = await ctx.db
        .query("taskDispatches")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .collect();

      const active = dispatches
        .filter((row) => row.status === "pending" || row.status === "running")
        .sort((a, b) => b.requestedAt - a.requestedAt)[0];

      if (!active) return null;
      return {
        _id: active._id,
        taskId: active.taskId,
        status: active.status,
        requestedAt: active.requestedAt,
        startedAt: active.startedAt,
        targetAgentId: active.targetAgentId,
      };
    } catch (error) {
      console.error("getDispatchState failed", error);
      return null;
    }
  },
});

export const listDispatchStates = query({
  args: {},
  handler: async (ctx) => {
    try {
      const [pending, running] = await Promise.all([
        ctx.db
          .query("taskDispatches")
          .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
          .collect(),
        ctx.db
          .query("taskDispatches")
          .withIndex("by_status_requestedAt", (q) => q.eq("status", "running"))
          .collect(),
      ]);

      const merged = [...pending, ...running].sort((a, b) => b.requestedAt - a.requestedAt);
      const seen = new Set<string>();
      const out: Array<{
        _id: string;
        taskId: string;
        status: "pending" | "running";
        requestedAt: number;
        startedAt?: number;
        targetAgentId?: string;
      }> = [];

      for (const row of merged) {
        const key = row.taskId as string;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          _id: row._id as string,
          taskId: row.taskId as string,
          status: row.status === "running" ? "running" : "pending",
          requestedAt: row.requestedAt,
          startedAt: row.startedAt,
          targetAgentId: row.targetAgentId as string | undefined,
        });
      }

      return out;
    } catch (error) {
      console.error("listDispatchStates failed", error);
      return [];
    }
  },
});
