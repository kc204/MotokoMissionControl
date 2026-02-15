import { queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const recent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, args.limit ?? 100));
    const rows = await ctx.db
      .query("activities")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});
