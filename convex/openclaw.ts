import { mutation } from "./_generated/server";
import { v } from "convex/values";

function summarizePrompt(prompt: string) {
  const first = prompt.trim().split("\n")[0] ?? "";
  if (first.length <= 90) return first;
  return `${first.slice(0, 87)}...`;
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function sessionKeyToAgentName(sessionKey?: string | null) {
  if (!sessionKey) return null;
  const parts = sessionKey.split(":");
  if (parts.length < 2 || parts[0] !== "agent") return null;
  const id = parts[1];
  if (id === "main") return "Motoko";
  if (id === "developer") return "Forge";
  if (id === "writer") return "Quill";
  if (id === "researcher") return "Recon";
  if (id === "monitor") return "Pulse";
  return null;
}

function taskIdFromSessionKey(sessionKey?: string | null) {
  if (!sessionKey) return null;
  const match = sessionKey.match(/mission[:-]([a-z0-9]+)/i);
  if (!match || !match[1]) return null;
  return match[1];
}

const eventAction = v.union(
  v.literal("start"),
  v.literal("progress"),
  v.literal("end"),
  v.literal("error")
);

export const receiveEvent = mutation({
  args: {
    runId: v.string(),
    action: eventAction,
    sessionKey: v.optional(v.union(v.string(), v.null())),
    agentId: v.optional(v.union(v.string(), v.null())),
    timestamp: v.optional(v.union(v.string(), v.null())),
    prompt: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
    message: v.optional(v.union(v.string(), v.null())),
    response: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    eventType: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventTime = args.timestamp ? new Date(args.timestamp).getTime() : now;
    const normalizedSessionKey = args.sessionKey ?? undefined;

    let task = await ctx.db
      .query("tasks")
      .withIndex("by_openclawRunId", (q) => q.eq("openclawRunId", args.runId))
      .first();

    if (!task && normalizedSessionKey) {
      const taskIdToken = taskIdFromSessionKey(normalizedSessionKey);
      if (taskIdToken) {
        const normalizedTaskId = ctx.db.normalizeId("tasks", taskIdToken);
        if (normalizedTaskId) {
          task = await ctx.db.get(normalizedTaskId);
          if (task) {
            await ctx.db.patch(task._id, {
              sessionKey: normalizedSessionKey,
              openclawRunId: args.runId,
              updatedAt: eventTime,
              lastEventAt: eventTime,
            });
          }
        }
      }
    }

    const mappedAgentName = args.agentId || sessionKeyToAgentName(args.sessionKey);
    const agent =
      mappedAgentName
        ? await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", mappedAgentName))
            .first()
        : null;

    if (!task && args.action === "start") {
      const title = summarizePrompt(args.prompt || `OpenClaw run ${args.runId.slice(0, 8)}`);
      const description = args.prompt || `OpenClaw lifecycle run ${args.runId}`;
      const assigneeIds = agent ? [agent._id] : [];

      const taskId = await ctx.db.insert("tasks", {
        title,
        description,
        status: "in_progress",
        priority: "medium",
        projectId: undefined,
        assigneeIds,
        createdBy: "openclaw",
        sessionKey: normalizedSessionKey,
        openclawRunId: args.runId,
        source: args.source ?? undefined,
        startedAt: eventTime,
        lastEventAt: eventTime,
        createdAt: eventTime,
        updatedAt: eventTime,
      });
      task = await ctx.db.get(taskId);

      await ctx.db.insert("activities", {
        type: "task_created",
        agentId: agent?._id,
        taskId,
        message: `OpenClaw started "${title}"`,
        createdAt: eventTime,
      });
    }

    if (!task) return;

    await ctx.db.patch(task._id, {
      lastEventAt: eventTime,
      updatedAt: eventTime,
      sessionKey: normalizedSessionKey ?? task.sessionKey,
      openclawRunId: args.runId,
      source: args.source ?? task.source,
    });

    const fromAgentId = agent?._id;

    if (args.action === "progress") {
      if (args.message) {
        await ctx.db.insert("messages", {
          taskId: task._id,
          fromAgentId,
          agentId: fromAgentId,
          fromUser: false,
          content: args.message,
          text: args.message,
          mentions: [],
          channel: `task:${task._id}`,
          createdAt: eventTime,
        });
      }
      return;
    }

    if (args.action === "end") {
      const durationMs = eventTime - (task.startedAt || task.createdAt);
      const completionMsg = args.response
        ? `Completed in ${formatDuration(durationMs)}\n\n${args.response}`
        : `Completed in ${formatDuration(durationMs)}`;

      await ctx.db.patch(task._id, {
        status: "done",
        completedAt: eventTime,
        updatedAt: eventTime,
      });

      await ctx.db.insert("messages", {
        taskId: task._id,
        fromAgentId,
        agentId: fromAgentId,
        fromUser: false,
        content: completionMsg,
        text: completionMsg,
        mentions: [],
        channel: `task:${task._id}`,
        createdAt: eventTime,
      });

      await ctx.db.insert("activities", {
        type: "task_updated",
        agentId: fromAgentId,
        taskId: task._id,
        message: `OpenClaw completed "${task.title}" in ${formatDuration(durationMs)}`,
        createdAt: eventTime,
      });
      return;
    }

    if (args.action === "error") {
      const err = args.error || "Unknown OpenClaw error";
      await ctx.db.patch(task._id, {
        status: "review",
        updatedAt: eventTime,
      });
      await ctx.db.insert("messages", {
        taskId: task._id,
        fromAgentId,
        agentId: fromAgentId,
        fromUser: false,
        content: `Error: ${err}`,
        text: `Error: ${err}`,
        mentions: [],
        channel: `task:${task._id}`,
        createdAt: eventTime,
      });
      await ctx.db.insert("activities", {
        type: "task_updated",
        agentId: fromAgentId,
        taskId: task._id,
        message: `OpenClaw error for "${task.title}"`,
        createdAt: eventTime,
      });
    }
  },
});
