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
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const listByRole = query({
  args: { role: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
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
    const agent = await ctx.db.get(id);
    if (!agent) throw new Error("Agent not found");

    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("heartbeats", {
      agentId: id,
      status: status === "active" ? "working" : "ok",
      message,
      createdAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      type: "agent_status_changed",
      agentId: id,
      message: `${agent.name} status changed to ${status}${message ? ` (${message})` : ""}`,
      createdAt: Date.now(),
    });
  },
});

export const updateModel = mutation({
  args: {
    id: v.id("agents"),
    modelType: v.union(
      v.literal("thinking"),
      v.literal("execution"),
      v.literal("heartbeat"),
      v.literal("fallback")
    ),
    modelName: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    const models = { ...agent.models, [args.modelType]: args.modelName };
    await ctx.db.patch(args.id, { models, updatedAt: Date.now() });
  },
});
