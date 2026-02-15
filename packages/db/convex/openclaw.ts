import { mutationGeneric as mutation } from "convex/server";
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

function taskIdFromSessionKey(sessionKey?: string | null) {
  if (!sessionKey) return null;
  const match = sessionKey.match(/mission[:-]([a-z0-9]+)/i);
  if (!match || !match[1]) return null;
  return match[1];
}

function normalizeDocumentType(
  type?: string | null
): "deliverable" | "research" | "spec" | "note" | "markdown" {
  const normalized = (type ?? "").trim().toLowerCase();
  if (normalized === "deliverable") return "deliverable";
  if (normalized === "research") return "research";
  if (normalized === "spec") return "spec";
  if (normalized === "markdown" || normalized === "md") return "markdown";
  if (normalized === "note") return "note";
  return "note";
}

const eventAction = v.union(
  v.literal("start"),
  v.literal("progress"),
  v.literal("end"),
  v.literal("error"),
  v.literal("document")
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
    document: v.optional(
      v.object({
        title: v.string(),
        content: v.string(),
        type: v.string(),
        path: v.optional(v.union(v.string(), v.null())),
      })
    ),
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

    let agent = null as any;
    if (normalizedSessionKey) {
      agent = await ctx.db
        .query("agents")
        .withIndex("by_sessionKey", (q) => q.eq("sessionKey", normalizedSessionKey))
        .first();
    }

    if (!agent && args.agentId) {
      const agents = await ctx.db.query("agents").collect();
      agent =
        agents.find((row: any) => row.sessionKey.includes(`agent:${args.agentId}:`)) ??
        null;
    }

    if (!task && args.action === "start") {
      const title = summarizePrompt(
        args.prompt || `OpenClaw run ${args.runId.slice(0, 8)}`
      );
      const description = args.prompt || `OpenClaw lifecycle run ${args.runId}`;
      const assigneeIds = agent ? [agent._id] : [];

      const taskId = await ctx.db.insert("tasks", {
        title,
        description,
        status: "in_progress",
        priority: "medium",
        projectId: undefined,
        assigneeIds,
        squadId: undefined,
        createdBy: "openclaw",
        tags: undefined,
        workflowNodeId: undefined,
        sessionKey: normalizedSessionKey,
        openclawRunId: args.runId,
        source: args.source ?? undefined,
        startedAt: eventTime,
        lastEventAt: eventTime,
        createdAt: eventTime,
        updatedAt: eventTime,
        completedAt: undefined,
        planningStatus: "none",
        planningQuestions: [],
        planningDraft: "",
        metadata: undefined,
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

    if (!task && args.action !== "document") return;
    if (task?.status === "archived") return;

    if (task) {
      await ctx.db.patch(task._id, {
        lastEventAt: eventTime,
        updatedAt: eventTime,
        sessionKey: normalizedSessionKey ?? task.sessionKey,
        openclawRunId: args.runId,
        source: args.source ?? task.source,
      });
    }

    const fromAgentId = agent?._id;

    if (args.action === "progress" && task) {
      if (args.message) {
        await ctx.db.insert("messages", {
          taskId: task._id,
          fromAgentId,
          fromUser: false,
          content: args.message,
          mentions: [],
          channel: `task:${task._id}`,
          createdAt: eventTime,
          metadata: undefined,
        });
      }
      return;
    }

    if (args.action === "end" && task) {
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
        fromUser: false,
        content: completionMsg,
        mentions: [],
        channel: `task:${task._id}`,
        createdAt: eventTime,
        metadata: undefined,
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

    if (args.action === "error" && task) {
      const err = args.error || "Unknown OpenClaw error";
      await ctx.db.patch(task._id, {
        status: "review",
        updatedAt: eventTime,
      });
      await ctx.db.insert("messages", {
        taskId: task._id,
        fromAgentId,
        fromUser: false,
        content: `Error: ${err}`,
        mentions: [],
        channel: `task:${task._id}`,
        createdAt: eventTime,
        metadata: undefined,
      });
      await ctx.db.insert("activities", {
        type: "task_updated",
        agentId: fromAgentId,
        taskId: task._id,
        message: `OpenClaw error for "${task.title}"`,
        createdAt: eventTime,
      });
      return;
    }

    if (args.action === "document" && args.document) {
      const createdBy = agent?.name ?? args.agentId ?? "OpenClaw";
      const documentType = normalizeDocumentType(args.document.type);

      const messageContent =
        `Document created: "${args.document.title}"\n\n` +
        `Type: ${documentType}` +
        (args.document.path ? `\nPath: ${args.document.path}` : "");

      let messageId: any | undefined;

      if (task) {
        messageId = await ctx.db.insert("messages", {
          taskId: task._id,
          fromAgentId,
          fromUser: false,
          content: messageContent,
          mentions: [],
          channel: `task:${task._id}`,
          createdAt: eventTime,
          metadata: undefined,
        });
      }

      await ctx.db.insert("documents", {
        title: args.document.title,
        content: args.document.content,
        type: documentType,
        path: args.document.path ?? undefined,
        taskId: task?._id,
        projectId: task?.projectId,
        agentId: fromAgentId,
        squadId: task?.squadId,
        embeddings: undefined,
        metadata: undefined,
        messageId,
        createdBy,
        createdAt: eventTime,
        updatedAt: eventTime,
      });

      await ctx.db.insert("activities", {
        type: "document_created",
        agentId: fromAgentId,
        taskId: task?._id,
        projectId: task?.projectId,
        squadId: task?.squadId,
        message: task
          ? `${createdBy} created document "${args.document.title}" for "${task.title}"`
          : `${createdBy} created document "${args.document.title}"`,
        createdAt: eventTime,
      });
    }
  },
});

