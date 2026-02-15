import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getUndelivered = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const take = args.limit ?? 100;
    return await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .order("desc")
      .take(take);
  },
});

export const getForAgent = query({
  args: { agentId: v.id("agents"), includeDelivered: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const includeDelivered = args.includeDelivered ?? false;
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_targetAgentId", (q) => q.eq("targetAgentId", args.agentId))
      .order("desc")
      .take(200);
    return includeDelivered ? all : all.filter((n) => !n.delivered);
  },
});

export const markDelivered = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification) return;
    await ctx.db.patch(args.id, {
      delivered: true,
      deliveredAt: Date.now(),
      attempts: (notification.attempts ?? 0) + 1,
      error: undefined,
    });
  },
});

export const markAttemptFailed = mutation({
  args: { id: v.id("notifications"), error: v.string() },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification) return;
    await ctx.db.patch(args.id, {
      attempts: (notification.attempts ?? 0) + 1,
      error: args.error.slice(0, 500),
    });
  },
});

export const create = mutation({
  args: {
    targetAgentId: v.id("agents"),
    content: v.string(),
    sourceTaskId: v.optional(v.id("tasks")),
    sourceMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ...args,
      delivered: false,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});
