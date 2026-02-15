import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("projects", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
