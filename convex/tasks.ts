import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("done"),
  v.literal("blocked")
);

const taskPriority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent")
);

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").order("desc").collect();
  },
});

export const getAssigned = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.filter((task) => task.assigneeIds.includes(args.agentId));
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: taskStatus,
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: now,
      completedAt: args.status === "done" ? now : undefined,
    });

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: args.id,
      projectId: task.projectId,
      message: `Task "${task.title}" moved to ${args.status}`,
      createdAt: now,
    });

    for (const assigneeId of task.assigneeIds) {
      await ctx.db.insert("notifications", {
        targetAgentId: assigneeId,
        content: `Status update: "${task.title}" is now ${args.status}.`,
        sourceTaskId: task._id,
        delivered: false,
        createdAt: now,
      });
    }
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    priority: taskPriority,
    status: taskStatus,
    createdBy: v.string(),
    projectId: v.optional(v.id("projects")),
    assigneeIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let assigneeIds = args.assigneeIds ?? [];

    // Default route: assign to squad lead when no explicit owner is provided.
    if (assigneeIds.length === 0) {
      const squadLead = await ctx.db
        .query("agents")
        .withIndex("by_role", (q) => q.eq("role", "Squad Lead"))
        .first();
      if (squadLead) assigneeIds = [squadLead._id];
    }

    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      priority: args.priority,
      status: args.status,
      projectId: args.projectId,
      assigneeIds,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_created",
      taskId,
      projectId: args.projectId,
      message: `Task created: "${args.title}"`,
      createdAt: now,
    });

    for (const assigneeId of assigneeIds) {
      const existingSub = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", taskId).eq("agentId", assigneeId)
        )
        .first();
      if (!existingSub) {
        await ctx.db.insert("taskSubscriptions", {
          taskId,
          agentId: assigneeId,
          reason: "assigned",
          createdAt: now,
        });
      }

      await ctx.db.insert("notifications", {
        targetAgentId: assigneeId,
        content: `New task assigned: "${args.title}"`,
        sourceTaskId: taskId,
        delivered: false,
        createdAt: now,
      });
    }

    return taskId;
  },
});

export const assign = mutation({
  args: {
    id: v.id("tasks"),
    assigneeIds: v.array(v.id("agents")),
    assignedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      assigneeIds: args.assigneeIds,
      status: args.assigneeIds.length > 0 ? "assigned" : task.status,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: task._id,
      projectId: task.projectId,
      message: `${args.assignedBy} assigned ${args.assigneeIds.length} agent(s) to "${task.title}"`,
      createdAt: now,
    });

    for (const assigneeId of args.assigneeIds) {
      const existingSub = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", task._id).eq("agentId", assigneeId)
        )
        .first();
      if (!existingSub) {
        await ctx.db.insert("taskSubscriptions", {
          taskId: task._id,
          agentId: assigneeId,
          reason: "assigned",
          createdAt: now,
        });
      }

      await ctx.db.insert("notifications", {
        targetAgentId: assigneeId,
        content: `You were assigned to "${task.title}" by ${args.assignedBy}.`,
        sourceTaskId: task._id,
        delivered: false,
        createdAt: now,
      });
    }
  },
});
