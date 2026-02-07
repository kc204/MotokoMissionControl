import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const PROFILES = [
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
  }
];

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Auto-seed if empty
    const profiles = await ctx.db.query("authProfiles").collect();
    if (profiles.length === 0) {
      // We can't mutate in a query, but we'll return the hardcoded list for now
      // A separate init step or manual seed is better, but for UI display this works
      // Actually, let's just return the DB profiles if they exist, or empty.
      // The UI will call seed if needed.
    }
    return profiles;
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("authProfiles").collect();
    if (existing.length > 0) return; // Already seeded

    for (const p of PROFILES) {
      await ctx.db.insert("authProfiles", p);
    }
  },
});

export const setActive = mutation({
  args: { id: v.id("authProfiles") },
  handler: async (ctx, args) => {
    const profiles = await ctx.db.query("authProfiles").collect();
    
    for (const p of profiles) {
      if (p._id === args.id) {
        await ctx.db.patch(p._id, { isActive: true });
      } else {
        await ctx.db.patch(p._id, { isActive: false });
      }
    }
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
