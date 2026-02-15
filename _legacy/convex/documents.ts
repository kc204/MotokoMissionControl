import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const documentType = v.union(
  v.literal("deliverable"),
  v.literal("research"),
  v.literal("spec"),
  v.literal("note"),
  v.literal("markdown")
);

export const byTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

export const hasDeliverable = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();
    return rows.some((doc) => doc.type === "deliverable");
  },
});

export const listAll = query({
  args: {
    type: v.optional(documentType),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("documents").withIndex("by_createdAt").order("desc").collect();
    const filtered = !args.type ? docs : docs.filter((doc) => doc.type === args.type);

    return await Promise.all(
      filtered.map(async (doc) => {
        const agent = doc.createdByAgentId ? await ctx.db.get(doc.createdByAgentId) : null;
        return {
          ...doc,
          createdBy: doc.createdBy || agent?.name || "Unknown",
          agentName: agent?.name ?? null,
          agentAvatar: agent?.avatar ?? null,
        };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getWithContext = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) return null;

    const agent = document.createdByAgentId ? await ctx.db.get(document.createdByAgentId) : null;
    const task = document.taskId ? await ctx.db.get(document.taskId) : null;
    const originMessage = document.messageId ? await ctx.db.get(document.messageId) : null;

    let conversationMessages: Array<{
      _id: string;
      content: string;
      createdAt: number;
      agentName: string | null;
      agentAvatar: string | null;
      fromUser: boolean;
    }> = [];

    if (document.taskId) {
      const thread = await ctx.db
        .query("messages")
        .withIndex("by_taskId", (q) => q.eq("taskId", document.taskId))
        .order("asc")
        .collect();

      conversationMessages = await Promise.all(
        thread.map(async (msg) => {
          const senderId = msg.fromAgentId ?? msg.agentId;
          const sender = senderId ? await ctx.db.get(senderId) : null;
          return {
            _id: msg._id,
            content: msg.content ?? msg.text ?? "",
            createdAt: msg.createdAt,
            agentName: sender?.name ?? null,
            agentAvatar: sender?.avatar ?? null,
            fromUser: Boolean(msg.fromUser),
          };
        })
      );
    }

    return {
      ...document,
      createdBy: document.createdBy || agent?.name || "Unknown",
      agentName: agent?.name ?? null,
      agentAvatar: agent?.avatar ?? null,
      agentRole: agent?.role ?? null,
      taskTitle: task?.title ?? null,
      taskStatus: task?.status ?? null,
      taskDescription: task?.description ?? null,
      originMessage: originMessage?.content ?? originMessage?.text ?? null,
      conversationMessages,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    type: documentType,
    path: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    createdBy: v.string(),
    createdByAgentId: v.optional(v.id("agents")),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("documents", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "document_created",
      taskId: args.taskId,
      projectId: args.projectId,
      message: `Document created: "${args.title}"`,
      createdAt: now,
    });

    return id;
  },
});

export const createDeliverable = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    taskId: v.id("tasks"),
    createdBy: v.string(),
    createdByAgentId: v.optional(v.id("agents")),
    messageId: v.optional(v.id("messages")),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const id = await ctx.db.insert("documents", {
      title: args.title,
      content: args.content,
      type: "deliverable",
      path: args.path,
      taskId: args.taskId,
      projectId: task.projectId,
      createdBy: args.createdBy,
      createdByAgentId: args.createdByAgentId,
      messageId: args.messageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "document_created",
      taskId: args.taskId,
      projectId: task.projectId,
      message: `Deliverable created: "${args.title}"`,
      createdAt: now,
    });

    return id;
  },
});
