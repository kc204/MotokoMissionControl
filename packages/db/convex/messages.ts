import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { parseMentions, taskIdFromChannel, truncate } from "./_utils";

export const list = query({
  args: {
    channel: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, args.limit ?? 50));

    let messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .order("desc")
      .take(limit);

    if (messages.length === 0 && args.channel.startsWith("task:")) {
      const rawTaskId = taskIdFromChannel(args.channel);
      const normalizedTaskId = rawTaskId
        ? ctx.db.normalizeId("tasks", rawTaskId)
        : null;
      if (normalizedTaskId) {
        messages = await ctx.db
          .query("messages")
          .withIndex("by_taskId", (q) => q.eq("taskId", normalizedTaskId))
          .order("desc")
          .take(limit);
      }
    }

    const out = await Promise.all(
      messages.reverse().map(async (msg) => {
        const agent = msg.fromAgentId ? await ctx.db.get(msg.fromAgentId) : null;
        return {
          ...msg,
          text: msg.content,
          agent,
        };
      })
    );

    return out;
  },
});

export const send = mutation({
  args: {
    channel: v.string(),
    content: v.string(),
    fromAgentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    fromUser: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mentions = parseMentions(args.content);
    const isHqChannel = args.channel === "hq";
    const derivedTaskId =
      args.taskId ??
      (() => {
        const token = taskIdFromChannel(args.channel);
        if (!token) return undefined;
        return ctx.db.normalizeId("tasks", token) ?? undefined;
      })();
    const fromUser = args.fromUser ?? !args.fromAgentId;

    const messageId = await ctx.db.insert("messages", {
      taskId: derivedTaskId,
      fromAgentId: args.fromAgentId,
      fromUser,
      content: args.content,
      mentions,
      channel: args.channel,
      createdAt: now,
      metadata: undefined,
    });

    await ctx.db.insert("activities", {
      type: "message_sent",
      agentId: args.fromAgentId,
      taskId: derivedTaskId,
      message: truncate(args.content, 120),
      createdAt: now,
    });

    const notifiedAgentIds = new Set<string>();

    // Auto-subscribe sender on task threads (for agent-authored messages).
    if (derivedTaskId && args.fromAgentId) {
      const existing = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", derivedTaskId).eq("agentId", args.fromAgentId!)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("taskSubscriptions", {
          taskId: derivedTaskId,
          agentId: args.fromAgentId,
          reason: "commented",
          createdAt: now,
        });
      }
    }

    // Mention -> notifications.
    if (mentions.length > 0 && (!isHqChannel || fromUser)) {
      const agents = await ctx.db.query("agents").collect();

      for (const tag of mentions) {
        if (tag === "@all") {
          // Keep broad fan-out explicit and user-driven to avoid agent-triggered reply storms.
          if (!fromUser) continue;
          for (const agent of agents) {
            if (args.fromAgentId && agent._id === args.fromAgentId) continue;
            notifiedAgentIds.add(agent._id);

            if (derivedTaskId) {
              const existing = await ctx.db
                .query("taskSubscriptions")
                .withIndex("by_taskId_agentId", (q) =>
                  q.eq("taskId", derivedTaskId).eq("agentId", agent._id)
                )
                .first();
              if (!existing) {
                await ctx.db.insert("taskSubscriptions", {
                  taskId: derivedTaskId,
                  agentId: agent._id,
                  reason: "mentioned",
                  createdAt: now,
                });
              }
            }

            await ctx.db.insert("notifications", {
              targetAgentId: agent._id,
              content: `Mentioned in ${args.channel}: ${args.content}`,
              sourceTaskId: derivedTaskId,
              sourceMessageId: messageId,
              delivered: false,
              deliveredAt: undefined,
              error: undefined,
              attempts: 0,
              claimedBy: undefined,
              claimedAt: undefined,
              createdAt: now,
            });
          }
          continue;
        }

        const cleanName = tag.slice(1).toLowerCase();
        const target = agents.find((agent) => agent.name.toLowerCase() === cleanName);
        if (!target) continue;
        if (args.fromAgentId && target._id === args.fromAgentId) continue;
        notifiedAgentIds.add(target._id);

        if (derivedTaskId) {
          const existing = await ctx.db
            .query("taskSubscriptions")
            .withIndex("by_taskId_agentId", (q) =>
              q.eq("taskId", derivedTaskId).eq("agentId", target._id)
            )
            .first();
          if (!existing) {
            await ctx.db.insert("taskSubscriptions", {
              taskId: derivedTaskId,
              agentId: target._id,
              reason: "mentioned",
              createdAt: now,
            });
          }
        }

        await ctx.db.insert("notifications", {
          targetAgentId: target._id,
          content: `You were mentioned in ${args.channel}: ${args.content}`,
          sourceTaskId: derivedTaskId,
          sourceMessageId: messageId,
          delivered: false,
          deliveredAt: undefined,
          error: undefined,
          attempts: 0,
          claimedBy: undefined,
          claimedAt: undefined,
          createdAt: now,
        });
      }
    }

    // User-authored task updates notify subscribers (except those already @mentioned above).
    if (derivedTaskId && fromUser) {
      const subscribers = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId", (q) => q.eq("taskId", derivedTaskId))
        .collect();
      for (const sub of subscribers) {
        if (args.fromAgentId && sub.agentId === args.fromAgentId) continue;
        if (notifiedAgentIds.has(sub.agentId)) continue;

        await ctx.db.insert("notifications", {
          targetAgentId: sub.agentId,
          content: `New thread update in ${args.channel}: ${args.content}`,
          sourceTaskId: derivedTaskId,
          sourceMessageId: messageId,
          delivered: false,
          deliveredAt: undefined,
          error: undefined,
          attempts: 0,
          claimedBy: undefined,
          claimedAt: undefined,
          createdAt: now,
        });
      }
    }

    return messageId;
  },
});
