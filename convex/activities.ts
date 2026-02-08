import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const activityType = v.union(
  v.literal("task_created"),
  v.literal("task_updated"),
  v.literal("message_sent"),
  v.literal("agent_status_changed"),
  v.literal("document_created"),
  v.literal("dispatch_started"),
  v.literal("dispatch_completed"),
  v.literal("testing_result"),
  v.literal("planning_update"),
  v.literal("subagent_update")
);

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const take = args.limit ?? 50;
    return await ctx.db
      .query("activities")
      .withIndex("by_createdAt")
      .order("desc")
      .take(take);
  },
});

export const forTask = query({
  args: { taskId: v.id("tasks"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const take = args.limit ?? 50;
    return await ctx.db
      .query("activities")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(take);
  },
});

export const forAgent = query({
  args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const take = args.limit ?? 50;
    return await ctx.db
      .query("activities")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(take);
  },
});

export const listFiltered = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(
      activityType
    ),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 80, 200));
    let rows = await ctx.db.query("activities").withIndex("by_createdAt").order("desc").take(take);
    if (args.type) {
      rows = rows.filter((row) => row.type === args.type);
    }
    if (args.agentId) {
      rows = rows.filter((row) => row.agentId === args.agentId);
    }
    return rows;
  },
});

export const log = mutation({
  args: {
    type: activityType,
    message: v.string(),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activities", {
      ...args,
      message: args.message.trim(),
      createdAt: Date.now(),
    });
  },
});
