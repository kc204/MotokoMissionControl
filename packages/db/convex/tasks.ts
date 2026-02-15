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
    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: "inbox",
      priority: args.priority ?? "medium",
      projectId: args.projectId,
      assigneeIds: args.assigneeIds ?? [],
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

    for (const agentId of args.assigneeIds ?? []) {
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
    const statusChanged =
      args.status !== undefined && args.status !== existing.status;

    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.assigneeIds !== undefined) patch.assigneeIds = args.assigneeIds;
    if (args.squadId !== undefined) patch.squadId = args.squadId;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.planningStatus !== undefined) patch.planningStatus = args.planningStatus;
    if (args.planningQuestions !== undefined) patch.planningQuestions = args.planningQuestions;
    if (args.planningDraft !== undefined) patch.planningDraft = args.planningDraft;

    if (args.status === "done" && existing.completedAt == null) {
      patch.completedAt = now;
    }

    await ctx.db.patch(args.id, patch as any);

    if (statusChanged && args.status === "done") {
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
