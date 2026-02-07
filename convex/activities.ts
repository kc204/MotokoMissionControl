import { query } from "./_generated/server";
import { v } from "convex/values";

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
