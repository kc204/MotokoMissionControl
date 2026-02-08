import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

export const listAll = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("deliverable"),
        v.literal("research"),
        v.literal("spec"),
        v.literal("note")
      )
    ),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("documents").withIndex("by_createdAt").order("desc").collect();
    if (!args.type) return docs;
    return docs.filter((doc) => doc.type === args.type);
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("spec"),
      v.literal("note")
    ),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    createdBy: v.string(),
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
