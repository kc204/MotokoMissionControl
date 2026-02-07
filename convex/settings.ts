import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("settings").collect();
  },
});

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("settings", {
      key: args.key,
      value: args.value,
      updatedAt: now,
    });
  },
});
