import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { channel: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .order("desc")
      .take(50);
      
    // Join with agents to get names/avatars
    return Promise.all(
      messages.reverse().map(async (msg) => {
        let agent = null;
        if (msg.agentId) {
          agent = await ctx.db.get(msg.agentId);
        }
        return { ...msg, agent };
      })
    );
  },
});

export const send = mutation({
  args: {
    channel: v.string(),
    text: v.string(),
    agentId: v.optional(v.id("agents")), // Optional: if sent by an agent
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      channel: args.channel,
      text: args.text,
      agentId: args.agentId,
      createdAt: Date.now(),
    });
  },
});
