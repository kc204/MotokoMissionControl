import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const subscriptionReason = v.union(
  v.literal("assigned"),
  v.literal("mentioned"),
  v.literal("commented"),
  v.literal("manual")
);

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

export const listForAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const subscribe = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    reason: subscriptionReason,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_taskId_agentId", (q) =>
        q.eq("taskId", args.taskId).eq("agentId", args.agentId)
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("taskSubscriptions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const unsubscribe = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_taskId_agentId", (q) =>
        q.eq("taskId", args.taskId).eq("agentId", args.agentId)
      )
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});
