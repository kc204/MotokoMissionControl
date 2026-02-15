import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const AUTOMATION_CONFIG_KEY = "automation:config";

const DEFAULT_AUTOMATION_CONFIG = {
  autoDispatchEnabled: true,
  notificationDeliveryEnabled: true,
  notificationBatchSize: 10,
  heartbeatEnabled: true,
  heartbeatMaxNotifications: 3,
  heartbeatMaxTasks: 3,
  heartbeatMaxActivities: 4,
  heartbeatRequireChatUpdate: false,
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.max(min, Math.min(max, rounded));
}

function parseAutomationConfig(value: unknown) {
  const raw = toRecord(value);
  return {
    autoDispatchEnabled: normalizeBool(
      raw.autoDispatchEnabled,
      DEFAULT_AUTOMATION_CONFIG.autoDispatchEnabled
    ),
    notificationDeliveryEnabled: normalizeBool(
      raw.notificationDeliveryEnabled,
      DEFAULT_AUTOMATION_CONFIG.notificationDeliveryEnabled
    ),
    notificationBatchSize: normalizeInt(
      raw.notificationBatchSize,
      DEFAULT_AUTOMATION_CONFIG.notificationBatchSize,
      1,
      50
    ),
    heartbeatEnabled: normalizeBool(raw.heartbeatEnabled, DEFAULT_AUTOMATION_CONFIG.heartbeatEnabled),
    heartbeatMaxNotifications: normalizeInt(
      raw.heartbeatMaxNotifications,
      DEFAULT_AUTOMATION_CONFIG.heartbeatMaxNotifications,
      1,
      20
    ),
    heartbeatMaxTasks: normalizeInt(
      raw.heartbeatMaxTasks,
      DEFAULT_AUTOMATION_CONFIG.heartbeatMaxTasks,
      1,
      20
    ),
    heartbeatMaxActivities: normalizeInt(
      raw.heartbeatMaxActivities,
      DEFAULT_AUTOMATION_CONFIG.heartbeatMaxActivities,
      1,
      30
    ),
    heartbeatRequireChatUpdate: normalizeBool(
      raw.heartbeatRequireChatUpdate,
      DEFAULT_AUTOMATION_CONFIG.heartbeatRequireChatUpdate
    ),
  };
}

function parseLease(value: unknown): { owner: string | null; expiresAt: number } {
  const raw = toRecord(value);
  const owner = typeof raw.owner === "string" && raw.owner ? raw.owner : null;
  const expiresAt =
    typeof raw.expiresAt === "number" && Number.isFinite(raw.expiresAt) ? raw.expiresAt : 0;
  return { owner, expiresAt };
}

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("settings").withIndex("by_key").collect();
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
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

export const getAutomationConfig = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", AUTOMATION_CONFIG_KEY))
      .first();
    return parseAutomationConfig(row?.value);
  },
});

export const updateAutomationConfig = mutation({
  args: {
    autoDispatchEnabled: v.optional(v.boolean()),
    notificationDeliveryEnabled: v.optional(v.boolean()),
    notificationBatchSize: v.optional(v.number()),
    heartbeatEnabled: v.optional(v.boolean()),
    heartbeatMaxNotifications: v.optional(v.number()),
    heartbeatMaxTasks: v.optional(v.number()),
    heartbeatMaxActivities: v.optional(v.number()),
    heartbeatRequireChatUpdate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", AUTOMATION_CONFIG_KEY))
      .first();
    const base = parseAutomationConfig(existing?.value);

    const next = {
      autoDispatchEnabled:
        args.autoDispatchEnabled === undefined ? base.autoDispatchEnabled : args.autoDispatchEnabled,
      notificationDeliveryEnabled:
        args.notificationDeliveryEnabled === undefined
          ? base.notificationDeliveryEnabled
          : args.notificationDeliveryEnabled,
      notificationBatchSize:
        args.notificationBatchSize === undefined
          ? base.notificationBatchSize
          : normalizeInt(args.notificationBatchSize, base.notificationBatchSize, 1, 50),
      heartbeatEnabled:
        args.heartbeatEnabled === undefined ? base.heartbeatEnabled : args.heartbeatEnabled,
      heartbeatMaxNotifications:
        args.heartbeatMaxNotifications === undefined
          ? base.heartbeatMaxNotifications
          : normalizeInt(args.heartbeatMaxNotifications, base.heartbeatMaxNotifications, 1, 20),
      heartbeatMaxTasks:
        args.heartbeatMaxTasks === undefined
          ? base.heartbeatMaxTasks
          : normalizeInt(args.heartbeatMaxTasks, base.heartbeatMaxTasks, 1, 20),
      heartbeatMaxActivities:
        args.heartbeatMaxActivities === undefined
          ? base.heartbeatMaxActivities
          : normalizeInt(args.heartbeatMaxActivities, base.heartbeatMaxActivities, 1, 30),
      heartbeatRequireChatUpdate:
        args.heartbeatRequireChatUpdate === undefined
          ? base.heartbeatRequireChatUpdate
          : args.heartbeatRequireChatUpdate,
    };

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { value: next, updatedAt: now });
    } else {
      await ctx.db.insert("settings", {
        key: AUTOMATION_CONFIG_KEY,
        value: next,
        updatedAt: now,
      });
    }

    return next;
  },
});

export const acquireLease = mutation({
  args: {
    key: v.string(),
    owner: v.string(),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    const now = Date.now();
    const ttlMs = normalizeInt(args.ttlMs, 8000, 1000, 120000);
    const nextExpiresAt = now + ttlMs;

    const lease = parseLease(existing?.value);
    const canAcquire =
      !existing || lease.owner === args.owner || lease.expiresAt <= now || lease.owner === null;

    if (canAcquire) {
      const nextValue = {
        owner: args.owner,
        expiresAt: nextExpiresAt,
        renewedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, { value: nextValue, updatedAt: now });
      } else {
        await ctx.db.insert("settings", {
          key: args.key,
          value: nextValue,
          updatedAt: now,
        });
      }
      return { acquired: true, owner: args.owner, expiresAt: nextExpiresAt };
    }

    return {
      acquired: false,
      owner: lease.owner,
      expiresAt: lease.expiresAt,
    };
  },
});

export const releaseLease = mutation({
  args: {
    key: v.string(),
    owner: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) return false;

    const lease = parseLease(existing.value);
    if (lease.owner !== args.owner) return false;

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      value: { owner: null, expiresAt: 0, releasedAt: now },
      updatedAt: now,
    });
    return true;
  },
});
