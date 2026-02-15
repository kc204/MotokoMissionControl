import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const agentStatus = v.union(
  v.literal("idle"),
  v.literal("active"),
  v.literal("blocked"),
  v.literal("offline")
);

const agentLevel = v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC"));

const modelConfig = v.object({
  thinking: v.string(),
  execution: v.optional(v.string()),
  heartbeat: v.string(),
  fallback: v.string(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").withIndex("by_name").collect();
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

export const create = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    level: v.optional(agentLevel),
    status: v.optional(agentStatus),
    sessionKey: v.optional(v.string()),
    avatar: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    models: v.optional(modelConfig),
    squadId: v.optional(v.id("squads")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) throw new Error(`Agent name already exists: ${args.name}`);

    const now = Date.now();
    const sessionKey =
      args.sessionKey ?? `agent-${now}-${Math.random().toString(36).slice(2, 10)}`;
    const agentId = await ctx.db.insert("agents", {
      name: args.name,
      role: args.role,
      level: args.level,
      status: args.status ?? "idle",
      currentTaskId: undefined,
      squadId: args.squadId,
      sessionKey,
      avatar: args.avatar,
      systemPrompt: args.systemPrompt,
      character: args.character,
      lore: args.lore,
      models:
        args.models ?? ({
          thinking: "openai-codex/gpt-5.2",
          execution: "openai-codex/gpt-5.2",
          heartbeat: "google/gemini-2.5-flash",
          fallback: "openai-codex/gpt-5.2",
        } as const),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "agent_status_changed",
      agentId,
      message: `Agent created: ${args.name} (${args.role})`,
      createdAt: now,
    });

    return agentId;
  },
});

export const update = mutation({
  args: {
    id: v.id("agents"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    level: v.optional(agentLevel),
    status: v.optional(agentStatus),
    currentTaskId: v.optional(v.id("tasks")),
    squadId: v.optional(v.id("squads")),
    sessionKey: v.optional(v.string()),
    avatar: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    models: v.optional(modelConfig),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;

    if (args.name && args.name !== existing.name) {
      const byName = await ctx.db
        .query("agents")
        .withIndex("by_name", (q) => q.eq("name", args.name!))
        .first();
      if (byName && byName._id !== existing._id) {
        throw new Error(`Agent name already exists: ${args.name}`);
      }
    }

    const now = Date.now();
    const statusChanged =
      args.status !== undefined && args.status !== existing.status;

    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name;
    if (args.role !== undefined) patch.role = args.role;
    if (args.level !== undefined) patch.level = args.level;
    if (args.status !== undefined) patch.status = args.status;
    if (args.currentTaskId !== undefined) patch.currentTaskId = args.currentTaskId;
    if (args.squadId !== undefined) patch.squadId = args.squadId;
    if (args.sessionKey !== undefined) patch.sessionKey = args.sessionKey;
    if (args.avatar !== undefined) patch.avatar = args.avatar;
    if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
    if (args.character !== undefined) patch.character = args.character;
    if (args.lore !== undefined) patch.lore = args.lore;
    if (args.models !== undefined) patch.models = args.models;

    await ctx.db.patch(args.id, patch as any);

    if (statusChanged) {
      await ctx.db.insert("activities", {
        type: "agent_status_changed",
        agentId: args.id,
        message: `Agent ${existing.name} status: ${existing.status} -> ${args.status}`,
        createdAt: now,
      });
    }
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    await ctx.db.delete(args.id);

    await ctx.db.insert("activities", {
      type: "agent_status_changed",
      agentId: args.id,
      message: `Agent deleted: ${agent.name}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateModel = mutation({
  args: {
    id: v.id("agents"),
    modelType: v.union(v.literal("thinking"), v.literal("execution"), v.literal("heartbeat"), v.literal("fallback")),
    modelName: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    const models = { ...(agent.models || {}) };
    models[args.modelType] = args.modelName;

    await ctx.db.patch(args.id, {
      models,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      type: "agent_status_changed",
      agentId: args.id,
      message: `Agent ${agent.name} ${args.modelType} model updated`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
