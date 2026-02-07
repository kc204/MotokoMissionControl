import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status as any,
      updatedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    priority: v.string(),
    status: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", {
      ...args,
      assigneeIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: args.status as any,
      priority: args.priority as any,
    });
  },
});


