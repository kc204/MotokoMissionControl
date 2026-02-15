import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const getUndelivered = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(200, args.limit ?? 100));
    return await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .order("desc")
      .take(take);
  },
});

export const hasUndelivered = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .order("desc")
      .first();
    return !!row;
  },
});

export const getForAgent = query({
  args: {
    agentId: v.id("agents"),
    includeDelivered: v.optional(v.boolean()),
  },
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

export const claimNext = mutation({
  args: {
    runnerId: v.string(),
    claimTtlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ttlMs = Math.max(5_000, Math.min(10 * 60_000, args.claimTtlMs ?? 60_000));

    const candidates = await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .order("desc")
      .take(50);

    const next = candidates.find((n: any) => {
      const claimedAt = typeof n.claimedAt === "number" ? n.claimedAt : 0;
      return claimedAt === 0 || claimedAt < now - ttlMs;
    });

    if (!next) return null;

    await ctx.db.patch(next._id, {
      claimedBy: args.runnerId,
      claimedAt: now,
      attempts: (next.attempts ?? 0) + 1,
      error: undefined,
    });

    const agent = await ctx.db.get(next.targetAgentId);

    return {
      notificationId: next._id,
      targetAgentId: next.targetAgentId,
      targetSessionKey: agent?.sessionKey ?? null,
      content: next.content,
    };
  },
});

export const markDelivered = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      delivered: true,
      deliveredAt: now,
      claimedBy: undefined,
      claimedAt: undefined,
      error: undefined,
    });
  },
});

export const markAttemptFailed = mutation({
  args: { id: v.id("notifications"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      claimedBy: undefined,
      claimedAt: undefined,
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
      targetAgentId: args.targetAgentId,
      content: args.content,
      sourceTaskId: args.sourceTaskId,
      sourceMessageId: args.sourceMessageId,
      delivered: false,
      deliveredAt: undefined,
      error: undefined,
      attempts: 0,
      claimedBy: undefined,
      claimedAt: undefined,
      createdAt: Date.now(),
    });
  },
});

