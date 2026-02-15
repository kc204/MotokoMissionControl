import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const documentType = v.union(
  v.literal("deliverable"),
  v.literal("research"),
  v.literal("spec"),
  v.literal("note"),
  v.literal("markdown")
);

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(200);
  },
});

export const listAll = query({
  args: {
    type: v.optional(documentType),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("documents").withIndex("by_createdAt").order("desc").collect();
    const filtered = !args.type ? docs : docs.filter((doc) => doc.type === args.type);

    const uniqueAgentIds = Array.from(
      new Set(
        filtered
          .map((doc) => doc.agentId)
          .filter((id): id is NonNullable<typeof id> => Boolean(id))
      )
    );
    const agentRows = await Promise.all(uniqueAgentIds.map((id) => ctx.db.get(id)));
    const agentsById = new Map(
      agentRows
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => [row._id, row])
    );

    return filtered.map((doc) => {
      const agent = doc.agentId ? agentsById.get(doc.agentId) ?? null : null;
      return {
        ...doc,
        createdBy: doc.createdBy || agent?.name || "Unknown",
        agentName: agent?.name ?? null,
        agentAvatar: agent?.avatar ?? null,
      };
    });
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

    const agent = document.agentId ? await ctx.db.get(document.agentId) : null;
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
      const uniqueSenderIds = Array.from(
        new Set(
          thread
            .map((msg) => msg.fromAgentId)
            .filter((id): id is NonNullable<typeof id> => Boolean(id))
        )
      );
      const senderRows = await Promise.all(uniqueSenderIds.map((id) => ctx.db.get(id)));
      const sendersById = new Map(
        senderRows
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => [row._id, row])
      );

      conversationMessages = thread.map((msg) => {
        const sender = msg.fromAgentId ? sendersById.get(msg.fromAgentId) ?? null : null;
        return {
          _id: msg._id,
          content: msg.content ?? "",
          createdAt: msg.createdAt,
          agentName: sender?.name ?? null,
          agentAvatar: sender?.avatar ?? null,
          fromUser: Boolean(msg.fromUser),
        };
      });
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
      originMessage: originMessage?.content ?? null,
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
    agentId: v.optional(v.id("agents")),
    squadId: v.optional(v.id("squads")),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const docId = await ctx.db.insert("documents", {
      title: args.title,
      content: args.content,
      type: args.type,
      path: args.path,
      taskId: args.taskId,
      projectId: args.projectId,
      agentId: args.agentId,
      squadId: args.squadId,
      embeddings: undefined,
      metadata: undefined,
      messageId: undefined,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "document_created",
      agentId: args.agentId,
      taskId: args.taskId,
      projectId: args.projectId,
      squadId: args.squadId,
      message: `Document created: ${args.title}`,
      createdAt: now,
    });

    return docId;
  },
});

export const createDeliverable = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    taskId: v.id("tasks"),
    agentId: v.optional(v.id("agents")),
    messageId: v.optional(v.id("messages")),
    path: v.optional(v.string()),
    createdBy: v.string(),
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
      agentId: args.agentId,
      squadId: task.squadId,
      embeddings: undefined,
      metadata: undefined,
      messageId: args.messageId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "document_created",
      agentId: args.agentId,
      taskId: args.taskId,
      projectId: task.projectId,
      squadId: task.squadId,
      message: `Deliverable created: "${args.title}"`,
      createdAt: now,
    });

    return id;
  },
});
