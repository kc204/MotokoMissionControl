import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
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

const dispatchStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
);

function truncate(text: string, max = 240) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function extractMessageText(message: {
  content?: string;
  text?: string;
}) {
  return (message.content ?? message.text ?? "").trim();
}

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

export const getDispatchState = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
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
  },
});

export const listDispatchStates = query({
  args: {},
  handler: async (ctx) => {
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
      const status = row.status === "running" ? "running" : "pending";
      out.push({
        _id: row._id as string,
        taskId: row.taskId as string,
        status,
        requestedAt: row.requestedAt,
        startedAt: row.startedAt,
        targetAgentId: row.targetAgentId as string | undefined,
      });
    }

    return out;
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

export const archive = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: args.id,
      projectId: task.projectId,
      message: `Task "${task.title}" archived`,
      createdAt: now,
    });
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
    tags: v.optional(v.array(v.string())),
    borderColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let assigneeIds = args.assigneeIds ?? [];

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
      tags: args.tags ?? [],
      borderColor: args.borderColor,
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
      status:
        args.assigneeIds.length > 0
          ? task.status === "inbox" || task.status === "archived"
            ? "assigned"
            : task.status
          : task.status,
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

export const updateDetails = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(taskPriority),
    tags: v.optional(v.array(v.string())),
    borderColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const patch: {
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      tags?: string[];
      borderColor?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.borderColor !== undefined) patch.borderColor = args.borderColor;

    await ctx.db.patch(args.id, patch);
    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: task._id,
      projectId: task.projectId,
      message: `Task "${task.title}" details updated`,
      createdAt: Date.now(),
    });
  },
});

export const enqueueDispatch = mutation({
  args: {
    taskId: v.id("tasks"),
    requestedBy: v.optional(v.string()),
    prompt: v.optional(v.string()),
    targetAgentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (args.targetAgentId) {
      const agent = await ctx.db.get(args.targetAgentId);
      if (!agent) throw new Error("Target agent not found");
    }

    const existing = await ctx.db
      .query("taskDispatches")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();
    const active = existing.find((row) => row.status === "pending" || row.status === "running");
    if (active) return active._id;

    const now = Date.now();
    const dispatchId = await ctx.db.insert("taskDispatches", {
      taskId: args.taskId,
      targetAgentId: args.targetAgentId,
      requestedBy: args.requestedBy?.trim() || "Mission Control",
      prompt: args.prompt?.trim() || undefined,
      status: "pending",
      requestedAt: now,
    });

    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      updatedAt: now,
      completedAt: undefined,
    });

    const trimmedPrompt = args.prompt?.trim() || "";
    if (trimmedPrompt) {
      await ctx.db.insert("messages", {
        taskId: args.taskId,
        fromUser: true,
        content: trimmedPrompt,
        text: trimmedPrompt,
        channel: `task:${args.taskId}`,
        mentions: [],
        createdAt: now,
      });
    }

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: args.taskId,
      projectId: task.projectId,
      message: `Dispatch queued for "${task.title}"`,
      createdAt: now,
    });

    return dispatchId;
  },
});

export const claimNextDispatch = mutation({
  args: { runner: v.string() },
  handler: async (ctx, args) => {
    const next = await ctx.db
      .query("taskDispatches")
      .withIndex("by_status_requestedAt", (q) => q.eq("status", "pending"))
      .first();
    if (!next) return null;

    const now = Date.now();
    await ctx.db.patch(next._id, {
      status: "running",
      runner: args.runner,
      startedAt: now,
      error: undefined,
    });

    const task = await ctx.db.get(next.taskId);
    if (!task) {
      await ctx.db.patch(next._id, {
        status: "failed",
        finishedAt: now,
        error: "Task not found",
      });
      return null;
    }

    let targetAgent =
      (next.targetAgentId ? await ctx.db.get(next.targetAgentId) : null) ??
      (task.assigneeIds[0] ? await ctx.db.get(task.assigneeIds[0]) : null);

    if (!targetAgent) {
      targetAgent =
        (await ctx.db
          .query("agents")
          .withIndex("by_name", (q) => q.eq("name", "Motoko"))
          .first()) ?? null;
    }

    if (!targetAgent) {
      await ctx.db.patch(next._id, {
        status: "failed",
        finishedAt: now,
        error: "No target agent available",
      });
      return null;
    }

    const thread = await ctx.db
      .query("messages")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .order("desc")
      .take(20);
    const threadSorted = [...thread].reverse().map((message) => {
      const text = extractMessageText(message);
      return {
        fromUser: !!message.fromUser,
        text,
      };
    });

    return {
      dispatchId: next._id,
      taskId: task._id,
      taskTitle: task.title,
      taskDescription: task.description,
      taskPriority: task.priority,
      taskTags: task.tags ?? [],
      targetAgentId: targetAgent._id,
      targetAgentName: targetAgent.name,
      targetSessionKey: targetAgent.sessionKey,
      targetThinkingModel: targetAgent.models.thinking,
      targetAgentLevel: targetAgent.level ?? "SPC",
      targetAgentRole: targetAgent.role,
      targetAgentSystemPrompt: targetAgent.systemPrompt ?? "",
      targetAgentCharacter: targetAgent.character ?? "",
      targetAgentLore: targetAgent.lore ?? "",
      prompt: next.prompt ?? "",
      threadMessages: threadSorted,
    };
  },
});

export const completeDispatch = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
    runId: v.optional(v.string()),
    resultPreview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dispatch = await ctx.db.get(args.dispatchId);
    if (!dispatch) throw new Error("Dispatch not found");
    const task = await ctx.db.get(dispatch.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    await ctx.db.patch(args.dispatchId, {
      status: "completed",
      runId: args.runId,
      resultPreview: args.resultPreview,
      finishedAt: now,
      error: undefined,
    });

    await ctx.db.patch(task._id, {
      updatedAt: now,
      openclawRunId: args.runId ?? task.openclawRunId,
    });

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: task._id,
      projectId: task.projectId,
      message: args.runId
        ? `Dispatch started for "${task.title}" (run ${args.runId.slice(0, 8)})`
        : `Dispatch started for "${task.title}"`,
      createdAt: now,
    });
  },
});

export const failDispatch = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const dispatch = await ctx.db.get(args.dispatchId);
    if (!dispatch) throw new Error("Dispatch not found");
    const task = await ctx.db.get(dispatch.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    const error = truncate(args.error, 1000);
    await ctx.db.patch(args.dispatchId, {
      status: "failed",
      finishedAt: now,
      error,
    });

    await ctx.db.patch(task._id, {
      status: "review",
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_updated",
      taskId: task._id,
      projectId: task.projectId,
      message: `Dispatch failed for "${task.title}"`,
      createdAt: now,
    });

    for (const assigneeId of task.assigneeIds) {
      await ctx.db.insert("notifications", {
        targetAgentId: assigneeId,
        content: `Dispatch failed for "${task.title}": ${error}`,
        sourceTaskId: task._id,
        delivered: false,
        createdAt: now,
      });
    }
  },
});

export const updateDispatchStatus = mutation({
  args: {
    dispatchId: v.id("taskDispatches"),
    status: dispatchStatus,
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dispatch = await ctx.db.get(args.dispatchId);
    if (!dispatch) throw new Error("Dispatch not found");

    const now = Date.now();
    await ctx.db.patch(args.dispatchId, {
      status: args.status,
      error: args.error,
      finishedAt: args.status === "completed" || args.status === "failed" ? now : undefined,
    });
  },
});
