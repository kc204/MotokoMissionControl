import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked")
    ),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, message } = args;
    
    // Update agent status
    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
    });

    // Log heartbeat
    await ctx.db.insert("heartbeats", {
      agentId: id,
      status: status === "active" ? "working" : "ok",
      message,
      createdAt: Date.now(),
    });
  },
});

export const updateModel = mutation({
  args: {
    id: v.id("agents"),
    modelType: v.literal("thinking"), // simplified for now, can add others
    modelName: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    const models = { ...agent.models, [args.modelType]: args.modelName };
    await ctx.db.patch(args.id, { models });
  },
});
