import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function parseMentions(content: string) {
  const matches = content.match(/@([a-zA-Z0-9_]+)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

function taskIdFromChannel(channel?: string) {
  if (!channel || !channel.startsWith("task:")) return undefined;
  return channel.slice(5);
}

export const list = query({
  args: { channel: v.string() },
  handler: async (ctx, args) => {
    let messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .order("desc")
      .take(50);

    if (messages.length === 0 && args.channel.startsWith("task:")) {
      // Fallback for future transition to taskId-first retrieval.
      const rawTaskId = taskIdFromChannel(args.channel);
      if (rawTaskId) {
        messages = await ctx.db
          .query("messages")
          .withIndex("by_taskId", (q) =>
            q.eq("taskId", rawTaskId as any)
          )
          .order("desc")
          .take(50);
      }
    }
      
    return Promise.all(
      messages.reverse().map(async (msg) => {
        let agent = null;
        const senderId = msg.fromAgentId ?? msg.agentId;
        if (senderId) {
          agent = await ctx.db.get(senderId);
        }
        // Return compatibility aliases so the current UI/scripts keep working.
        const text = msg.content ?? msg.text ?? "";
        return {
          ...msg,
          content: msg.content ?? msg.text ?? "",
          text,
          fromAgentId: senderId,
          agentId: senderId,
          agent,
        };
      })
    );
  },
});

export const send = mutation({
  args: {
    channel: v.string(),
    text: v.string(),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    fromUser: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mentions = parseMentions(args.text);
    const taskId = args.taskId ?? (taskIdFromChannel(args.channel) as any);
    const messageId = await ctx.db.insert("messages", {
      taskId,
      fromAgentId: args.agentId,
      agentId: args.agentId,
      fromUser: args.fromUser ?? !args.agentId,
      content: args.text,
      text: args.text,
      mentions,
      channel: args.channel,
      createdAt: now,
    });

    await ctx.db.insert("activities", {
      type: "message_sent",
      agentId: args.agentId,
      taskId,
      message: args.text.length > 100 ? `${args.text.slice(0, 100)}...` : args.text,
      createdAt: now,
    });

    const mentionedAgents = await ctx.db.query("agents").collect();
    const notifiedAgentIds = new Set<string>();

    // Auto-subscribe sender on task threads.
    if (taskId && args.agentId) {
      const existing = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId_agentId", (q) =>
          q.eq("taskId", taskId).eq("agentId", args.agentId!)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("taskSubscriptions", {
          taskId,
          agentId: args.agentId,
          reason: "commented",
          createdAt: now,
        });
      }
    }

    for (const tag of mentions) {
      if (tag === "@all") {
        // Keep broad fan-out explicit and user-driven to avoid agent-triggered reply storms.
        if (args.agentId) continue;
        for (const agent of mentionedAgents) {
          if (args.agentId && agent._id === args.agentId) continue;
          notifiedAgentIds.add(agent._id);

          if (taskId) {
            const existing = await ctx.db
              .query("taskSubscriptions")
              .withIndex("by_taskId_agentId", (q) =>
                q.eq("taskId", taskId).eq("agentId", agent._id)
              )
              .first();
            if (!existing) {
              await ctx.db.insert("taskSubscriptions", {
                taskId,
                agentId: agent._id,
                reason: "mentioned",
                createdAt: now,
              });
            }
          }

          await ctx.db.insert("notifications", {
            targetAgentId: agent._id,
            content: `Mentioned in ${args.channel}: ${args.text}`,
            sourceTaskId: taskId,
            sourceMessageId: messageId,
            delivered: false,
            createdAt: now,
          });
        }
        continue;
      }

      const cleanName = tag.slice(1).toLowerCase();
      const target = mentionedAgents.find(
        (agent) => agent.name.toLowerCase() === cleanName
      );
      if (!target) continue;
      if (args.agentId && target._id === args.agentId) continue;
      notifiedAgentIds.add(target._id);

      if (taskId) {
        const existing = await ctx.db
          .query("taskSubscriptions")
          .withIndex("by_taskId_agentId", (q) =>
            q.eq("taskId", taskId).eq("agentId", target._id)
          )
          .first();
        if (!existing) {
          await ctx.db.insert("taskSubscriptions", {
            taskId,
            agentId: target._id,
            reason: "mentioned",
            createdAt: now,
          });
        }
      }

      await ctx.db.insert("notifications", {
        targetAgentId: target._id,
        content: `You were mentioned in ${args.channel}: ${args.text}`,
        sourceTaskId: taskId,
        sourceMessageId: messageId,
        delivered: false,
        createdAt: now,
      });
    }

    // For agent-authored messages, only explicit @mentions notify others.
    // User-authored task updates still notify subscribers.
    if (taskId && !args.agentId) {
      const subscribers = await ctx.db
        .query("taskSubscriptions")
        .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
        .collect();
      for (const sub of subscribers) {
        if (args.agentId && sub.agentId === args.agentId) continue;
        if (notifiedAgentIds.has(sub.agentId)) continue;
        await ctx.db.insert("notifications", {
          targetAgentId: sub.agentId,
          content: `New thread update in ${args.channel}: ${args.text}`,
          sourceTaskId: taskId,
          sourceMessageId: messageId,
          delivered: false,
          createdAt: now,
        });
      }
    }

    return messageId;
  },
});
