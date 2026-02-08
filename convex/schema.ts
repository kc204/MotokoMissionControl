import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    color: v.string(),
    icon: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    level: v.optional(v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC"))),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked")
    ),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.string(),
    avatar: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    models: v.object({
      thinking: v.string(),
      execution: v.optional(v.string()),
      heartbeat: v.string(),
      fallback: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_role", ["role"])
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
      v.literal("blocked"),
      v.literal("archived")
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
    tags: v.optional(v.array(v.string())),
    borderColor: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    openclawRunId: v.optional(v.string()),
    source: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_openclawRunId", ["openclawRunId"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_createdAt", ["createdAt"])
    .index("by_projectId", ["projectId"]),
  messages: defineTable({
    taskId: v.optional(v.id("tasks")),
    fromAgentId: v.optional(v.id("agents")),
    agentId: v.optional(v.id("agents")), // legacy compatibility
    fromUser: v.optional(v.boolean()),
    content: v.optional(v.string()),
    text: v.optional(v.string()), // legacy compatibility
    mentions: v.optional(v.array(v.string())),
    channel: v.optional(v.string()), // "hq" or "task:<taskId>" for compatibility
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_channel", ["channel"])
    .index("by_createdAt", ["createdAt"]),
  activities: defineTable({
    type: v.union(
      v.literal("task_created"),
      v.literal("task_updated"),
      v.literal("message_sent"),
      v.literal("agent_status_changed"),
      v.literal("document_created")
    ),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_taskId", ["taskId"])
    .index("by_agentId", ["agentId"]),
  documents: defineTable({
    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("spec"),
      v.literal("note"),
      v.literal("markdown")
    ),
    path: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    createdBy: v.string(),
    createdByAgentId: v.optional(v.id("agents")),
    messageId: v.optional(v.id("messages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_projectId", ["projectId"])
    .index("by_createdByAgentId", ["createdByAgentId"])
    .index("by_messageId", ["messageId"])
    .index("by_createdAt", ["createdAt"]),
  notifications: defineTable({
    targetAgentId: v.id("agents"),
    content: v.string(),
    sourceTaskId: v.optional(v.id("tasks")),
    sourceMessageId: v.optional(v.id("messages")),
    delivered: v.boolean(),
    deliveredAt: v.optional(v.number()),
    error: v.optional(v.string()),
    attempts: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_targetAgentId", ["targetAgentId"])
    .index("by_delivered", ["delivered"]),
  taskSubscriptions: defineTable({
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    reason: v.union(
      v.literal("assigned"),
      v.literal("mentioned"),
      v.literal("commented"),
      v.literal("manual")
    ),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_agentId", ["agentId"])
    .index("by_taskId_agentId", ["taskId", "agentId"]),
  taskDispatches: defineTable({
    taskId: v.id("tasks"),
    targetAgentId: v.optional(v.id("agents")),
    requestedBy: v.string(),
    prompt: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    runner: v.optional(v.string()),
    runId: v.optional(v.string()),
    resultPreview: v.optional(v.string()),
    verificationStatus: v.optional(
      v.union(v.literal("pass"), v.literal("fail"), v.literal("not_run"), v.literal("unknown"))
    ),
    verificationSummary: v.optional(v.string()),
    verificationCommand: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_status_requestedAt", ["status", "requestedAt"]),
  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
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
  authProfiles: defineTable({
    email: v.string(),
    provider: v.string(),
    isActive: v.boolean(),
    profileId: v.string(), // e.g. "google-antigravity:kaceynwadike@gmail.com"
  }).index("by_isActive", ["isActive"]),
});
