import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_PROFILES = [
  {
    email: "kaceynwadike@gmail.com",
    provider: "google-antigravity",
    profileId: "google-antigravity:kaceynwadike@gmail.com",
    isActive: true, // Default
  },
  {
    email: "choikennedy2@gmail.com",
    provider: "google-antigravity",
    profileId: "google-antigravity:choikennedy2@gmail.com",
    isActive: false,
  },
  {
    email: "default",
    provider: "kimi-code",
    profileId: "kimi-code:default",
    isActive: false,
  },
];

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("authProfiles").collect();
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("authProfiles").collect();
    if (existing.length > 0) return;

    for (const p of DEFAULT_PROFILES) {
      await ctx.db.insert("authProfiles", p);
    }
  },
});

export const setActive = mutation({
  args: { id: v.id("authProfiles") },
  handler: async (ctx, args) => {
    const profiles = await ctx.db.query("authProfiles").collect();
    let found = false;

    for (const p of profiles) {
      if (p._id === args.id) {
        found = true;
        await ctx.db.patch(p._id, { isActive: true });
      } else {
        await ctx.db.patch(p._id, { isActive: false });
      }
    }

    if (!found) {
      throw new Error(`Auth profile not found: ${args.id}`);
    }
  },
});

export const syncProfiles = mutation({
  args: {
    profiles: v.array(
      v.object({
        email: v.string(),
        provider: v.string(),
        profileId: v.string(),
      })
    ),
    preferredActiveProfileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const incomingByProfileId = new Map<
      string,
      { email: string; provider: string; profileId: string }
    >();
    for (const profile of args.profiles) {
      if (!profile.profileId || !profile.provider) continue;
      incomingByProfileId.set(profile.profileId, profile);
    }

    const incoming = Array.from(incomingByProfileId.values());
    if (incoming.length === 0) {
      return await ctx.db.query("authProfiles").collect();
    }

    const existing = await ctx.db.query("authProfiles").collect();
    const existingByProfileId = new Map(existing.map((p) => [p.profileId, p]));
    const currentActive = existing.find((p) => p.isActive);

    const preferredActiveProfileId =
      args.preferredActiveProfileId && incomingByProfileId.has(args.preferredActiveProfileId)
        ? args.preferredActiveProfileId
        : undefined;
    const activeProfileId =
      preferredActiveProfileId ??
      (currentActive && incomingByProfileId.has(currentActive.profileId)
        ? currentActive.profileId
        : incoming[0].profileId);

    for (const profile of incoming) {
      const next = {
        email: profile.email,
        provider: profile.provider,
        profileId: profile.profileId,
        isActive: profile.profileId === activeProfileId,
      };
      const existingRow = existingByProfileId.get(profile.profileId);
      if (!existingRow) {
        await ctx.db.insert("authProfiles", next);
        continue;
      }

      if (
        existingRow.email !== next.email ||
        existingRow.provider !== next.provider ||
        existingRow.isActive !== next.isActive
      ) {
        await ctx.db.patch(existingRow._id, next);
      }
    }

    for (const row of existing) {
      if (!incomingByProfileId.has(row.profileId)) {
        await ctx.db.delete(row._id);
      }
    }

    return await ctx.db.query("authProfiles").collect();
  },
});

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("authProfiles")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .first();
  },
});
