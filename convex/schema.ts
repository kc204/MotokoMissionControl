import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked")
    ),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.string(),
    avatar: v.optional(v.string()),
    models: v.object({
      thinking: v.string(),
      execution: v.optional(v.string()),
      heartbeat: v.string(),
      fallback: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_currentTaskId", ["currentTaskId"]),
  tasks: defineTable({
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    projectId: v.optional(v.id("projects")),
    assigneeIds: v.array(v.id("agents")),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_projectId", ["projectId"]),
  heartbeats: defineTable({
    agentId: v.id("agents"),
    status: v.union(
      v.literal("ok"),
      v.literal("working"),
      v.literal("blocked"),
      v.literal("error")
    ),
    message: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_agentId", ["agentId"]),
  assignments: defineTable({
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    assignedBy: v.string(),
    active: v.boolean(),
    assignedAt: v.number(),
    unassignedAt: v.optional(v.number()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_agentId", ["agentId"])
    .index("by_taskId_agentId", ["taskId", "agentId"]),
  messages: defineTable({
    channel: v.string(), // "hq" or "task:<taskId>"
    agentId: v.optional(v.id("agents")), // null if system/user
    text: v.string(),
    createdAt: v.number(),
  }).index("by_channel", ["channel"]),
});
