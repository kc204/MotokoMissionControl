import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const agentStatus = v.union(v.literal("idle"), v.literal("active"), v.literal("blocked"));
const agentLevel = v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC"));
const OPENCLAW_AVAILABLE_MODELS_KEY = "openclaw:models:available";
const STATUS_ACTIVITY_DEDUP_MS = 5 * 60 * 1000;

function inferLevelFromRole(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes("lead")) return "LEAD" as const;
  if (normalized.includes("research") || normalized.includes("monitor")) return "SPC" as const;
  return "INT" as const;
}

function normalizeModelName(modelName?: string) {
  if (!modelName) return modelName;
  const trimmed = modelName.trim();
  if (trimmed === "anthropic/codex-cli") return "codex-cli";
  return trimmed;
}

function parseAvailableModelIds(value: unknown) {
  if (!value || typeof value !== "object") return new Set<string>();
  const raw = value as { models?: unknown };
  if (!Array.isArray(raw.models)) return new Set<string>();
  const ids = new Set<string>();
  for (const item of raw.models) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { id?: unknown };
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (id) ids.add(id);
  }
  return ids;
}

function isModelIdInCatalog(modelId: string, catalog: Set<string>) {
  if (!modelId || catalog.size === 0) return true;
  if (catalog.has(modelId)) return true;
  for (const id of catalog) {
    if (id.endsWith(`/${modelId}`)) return true;
  }
  return false;
}

async function assertModelAvailable(ctx: MutationCtx, modelId: string) {
  const normalized = normalizeModelName(modelId) ?? modelId;
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", OPENCLAW_AVAILABLE_MODELS_KEY))
    .first();
  const catalog = parseAvailableModelIds(row?.value);
  if (catalog.size > 0 && !isModelIdInCatalog(normalized, catalog)) {
    throw new Error(`Model not available in OpenClaw runtime: ${normalized}`);
  }
}

function slugifyAgentId(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "agent";
}

function sessionRuntimeId(sessionKey: string) {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return "main";
}

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

export const getBySessionKey = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
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

export const createAgent = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    level: v.optional(agentLevel),
    status: v.optional(agentStatus),
    avatar: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    sessionIdHint: v.optional(v.string()),
    thinkingModel: v.optional(v.string()),
    executionModel: v.optional(v.string()),
    heartbeatModel: v.optional(v.string()),
    fallbackModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingByName = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existingByName) {
      throw new Error(`Agent name already exists: ${args.name}`);
    }

    const allAgents = await ctx.db.query("agents").collect();
    const usedRuntimeIds = new Set(allAgents.map((agent) => sessionRuntimeId(agent.sessionKey)));

    const requestedId = args.sessionIdHint ? slugifyAgentId(args.sessionIdHint) : slugifyAgentId(args.name);
    let runtimeId = requestedId;
    let suffix = 2;
    while (usedRuntimeIds.has(runtimeId)) {
      runtimeId = `${requestedId}-${suffix}`;
      suffix += 1;
    }

    if (args.thinkingModel) {
      await assertModelAvailable(ctx, args.thinkingModel);
    }
    if (args.fallbackModel) {
      await assertModelAvailable(ctx, args.fallbackModel);
    }

    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      name: args.name,
      role: args.role,
      level: args.level ?? inferLevelFromRole(args.role),
      status: args.status ?? "idle",
      currentTaskId: undefined,
      sessionKey: `agent:${runtimeId}:main`,
      avatar: args.avatar,
      systemPrompt: args.systemPrompt,
      character: args.character,
      lore: args.lore,
      models: {
        thinking:
          normalizeModelName(args.thinkingModel) ??
          "google-antigravity/claude-opus-4-5-thinking",
        execution: normalizeModelName(args.executionModel),
        heartbeat:
          normalizeModelName(args.heartbeatModel) ??
          "google/gemini-2.5-flash",
        fallback:
          normalizeModelName(args.fallbackModel) ??
          "google-antigravity/claude-sonnet-4-5",
      },
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

export const updateAgent = mutation({
  args: {
    id: v.id("agents"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    level: v.optional(agentLevel),
    status: v.optional(agentStatus),
    avatar: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    if (args.name !== undefined && args.name !== agent.name) {
      const nextName = args.name;
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_name", (q) => q.eq("name", nextName))
        .first();
      if (existing && existing._id !== args.id) {
        throw new Error(`Agent name already exists: ${nextName}`);
      }
    }

    const patch: {
      name?: string;
      role?: string;
      level?: "LEAD" | "INT" | "SPC";
      status?: "idle" | "active" | "blocked";
      avatar?: string;
      systemPrompt?: string;
      character?: string;
      lore?: string;
      sessionKey?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) patch.name = args.name;
    if (args.role !== undefined) patch.role = args.role;
    if (args.level !== undefined) patch.level = args.level;
    if (args.status !== undefined) patch.status = args.status;
    if (args.avatar !== undefined) patch.avatar = args.avatar;
    if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
    if (args.character !== undefined) patch.character = args.character;
    if (args.lore !== undefined) patch.lore = args.lore;
    if (args.sessionKey !== undefined) patch.sessionKey = args.sessionKey;
    if (args.role !== undefined && args.level === undefined) {
      patch.level = inferLevelFromRole(args.role);
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      if (!task.assigneeIds.includes(args.id)) continue;
      const nextAssignees = task.assigneeIds.filter((assigneeId) => assigneeId !== args.id);
      await ctx.db.patch(task._id, {
        assigneeIds: nextAssignees,
        status: nextAssignees.length === 0 && task.status === "assigned" ? "inbox" : task.status,
        updatedAt: Date.now(),
      });
    }

    const subs = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.id))
      .collect();
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }

    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_targetAgentId", (q) => q.eq("targetAgentId", args.id))
      .collect();
    for (const note of notes) {
      await ctx.db.delete(note._id);
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.id))
      .collect();
    for (const row of assignments) {
      await ctx.db.patch(row._id, {
        active: false,
        unassignedAt: Date.now(),
      });
    }

    await ctx.db.insert("activities", {
      type: "agent_status_changed",
      message: `Agent deleted: ${agent.name}`,
      createdAt: Date.now(),
    });

    await ctx.db.delete(args.id);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    status: agentStatus,
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, message } = args;
    const agent = await ctx.db.get(id);
    if (!agent) throw new Error("Agent not found");
    const now = Date.now();
    const normalizedMessage = message?.trim();
    const activityMessage = `${agent.name} status changed to ${status}${
      normalizedMessage ? ` (${normalizedMessage})` : ""
    }`;

    await ctx.db.patch(id, {
      status,
      updatedAt: now,
    });

    await ctx.db.insert("heartbeats", {
      agentId: id,
      status: status === "active" ? "working" : "ok",
      message: normalizedMessage,
      createdAt: now,
    });

    const recentStatusActivity = await ctx.db
      .query("activities")
      .withIndex("by_agentId", (q) => q.eq("agentId", id))
      .order("desc")
      .first();

    const isDuplicateStatusActivity =
      recentStatusActivity?.type === "agent_status_changed" &&
      recentStatusActivity.message === activityMessage &&
      now - recentStatusActivity.createdAt < STATUS_ACTIVITY_DEDUP_MS;

    if (!isDuplicateStatusActivity) {
      await ctx.db.insert("activities", {
        type: "agent_status_changed",
        agentId: id,
        message: activityMessage,
        createdAt: now,
      });
    }
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

    await assertModelAvailable(ctx, args.modelName);

    const models = {
      ...agent.models,
      [args.modelType]: normalizeModelName(args.modelName) ?? args.modelName,
    };
    await ctx.db.patch(args.id, { models, updatedAt: Date.now() });
  },
});
