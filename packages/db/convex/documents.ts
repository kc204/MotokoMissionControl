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

