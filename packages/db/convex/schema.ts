import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Projects
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    icon: v.optional(v.string()),
    settings: v.optional(v.record(v.string(), v.any())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // Squads - Agent teams with shared memory
  squads: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    icon: v.optional(v.string()),
    leadAgentId: v.optional(v.id("agents")),
    agentIds: v.array(v.id("agents")),
    sharedMemoryContext: v.optional(v.array(v.string())),
    sharedDocuments: v.optional(v.array(v.id("documents"))),
    preferences: v.optional(v.record(v.string(), v.any())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_leadAgentId", ["leadAgentId"]),

  // Agents
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    level: v.optional(v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC"))),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("offline")
    ),
    currentTaskId: v.optional(v.id("tasks")),
    squadId: v.optional(v.id("squads")),
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
    stats: v.optional(v.object({
      tasksCompleted: v.number(),
      tasksFailed: v.number(),
      averageCompletionTime: v.number(),
      lastActiveAt: v.number(),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_role", ["role"])
    .index("by_status", ["status"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_currentTaskId", ["currentTaskId"])
    .index("by_squadId", ["squadId"]),

  // Tasks
  tasks: defineTable({
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("testing"),
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
    squadId: v.optional(v.id("squads")),
    createdBy: v.string(),
    tags: v.optional(v.array(v.string())),
    workflowNodeId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    openclawRunId: v.optional(v.string()),
    source: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    planningStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("questions"),
        v.literal("ready"),
        v.literal("approved")
      )
    ),
    planningQuestions: v.optional(v.array(v.string())),
    planningDraft: v.optional(v.string()),
    metadata: v.optional(v.object({
      estimatedHours: v.optional(v.number()),
      actualHours: v.optional(v.number()),
      complexity: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
      reviewCycles: v.optional(v.number()),
    })),
  })
    .index("by_status", ["status"])
    .index("by_planningStatus", ["planningStatus"])
    .index("by_openclawRunId", ["openclawRunId"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_createdAt", ["createdAt"])
    .index("by_projectId", ["projectId"])
    .index("by_squadId", ["squadId"]),

  // Workflows
  workflows: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    nodes: v.array(v.object({
      id: v.string(),
      type: v.union(
        v.literal("trigger"),
        v.literal("agent"),
        v.literal("condition"),
        v.literal("action"),
        v.literal("wait"),
        v.literal("parallel"),
        v.literal("join")
      ),
      position: v.object({ x: v.number(), y: v.number() }),
      data: v.object({
        label: v.string(),
        config: v.optional(v.record(v.string(), v.any())),
        agentId: v.optional(v.id("agents")),
        squadId: v.optional(v.id("squads")),
        prompt: v.optional(v.string()),
      }),
    })),
    edges: v.array(v.object({
      id: v.string(),
      source: v.string(),
      target: v.string(),
      condition: v.optional(v.string()),
    })),
    isActive: v.boolean(),
    triggerType: v.union(
      v.literal("manual"),
      v.literal("task_created"),
      v.literal("task_completed"),
      v.literal("schedule"),
      v.literal("webhook")
    ),
    triggerConfig: v.optional(v.record(v.string(), v.any())),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_isActive", ["isActive"]),

  // Workflow Executions
  workflowExecutions: defineTable({
    workflowId: v.id("workflows"),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    currentNodeId: v.optional(v.string()),
    context: v.record(v.string(), v.any()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_workflowId", ["workflowId"])
    .index("by_status", ["status"]),

  // Messages
  messages: defineTable({
    taskId: v.optional(v.id("tasks")),
    fromAgentId: v.optional(v.id("agents")),
    fromUser: v.optional(v.boolean()),
    content: v.string(),
    mentions: v.optional(v.array(v.string())),
    channel: v.string(),
    metadata: v.optional(v.object({
      edited: v.optional(v.boolean()),
      editedAt: v.optional(v.number()),
      replyTo: v.optional(v.id("messages")),
      attachments: v.optional(v.array(v.object({
        type: v.union(v.literal("file"), v.literal("image"), v.literal("code")),
        name: v.string(),
        url: v.string(),
        size: v.optional(v.number()),
      }))),
    })),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_channel", ["channel"])
    .index("by_createdAt", ["createdAt"]),

  // Activities
  activities: defineTable({
    type: v.union(
      v.literal("task_created"),
      v.literal("task_updated"),
      v.literal("task_completed"),
      v.literal("message_sent"),
      v.literal("agent_status_changed"),
      v.literal("document_created"),
      v.literal("dispatch_started"),
      v.literal("dispatch_completed"),
      v.literal("testing_result"),
      v.literal("planning_update"),
      v.literal("subagent_update"),
      v.literal("workflow_triggered"),
      v.literal("squad_formed"),
      v.literal("integration_connected")
    ),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    squadId: v.optional(v.id("squads")),
    message: v.string(),
    metadata: v.optional(v.record(v.string(), v.any())),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_taskId", ["taskId"])
    .index("by_agentId", ["agentId"])
    .index("by_squadId", ["squadId"]),

  // Documents
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
    agentId: v.optional(v.id("agents")),
    squadId: v.optional(v.id("squads")),
    embeddings: v.optional(v.array(v.number())),
    metadata: v.optional(v.object({
      wordCount: v.optional(v.number()),
      readingTime: v.optional(v.number()),
      tags: v.optional(v.array(v.string())),
      source: v.optional(v.string()),
    })),
    messageId: v.optional(v.id("messages")),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_projectId", ["projectId"])
    .index("by_agentId", ["agentId"])
    .index("by_squadId", ["squadId"])
    .index("by_messageId", ["messageId"])
    .index("by_createdAt", ["createdAt"]),

  // Memory System
  memories: defineTable({
    agentId: v.optional(v.id("agents")),
    squadId: v.optional(v.id("squads")),
    type: v.union(
      v.literal("conversation"),
      v.literal("fact"),
      v.literal("preference"),
      v.literal("skill"),
      v.literal("feedback")
    ),
    content: v.string(),
    embeddings: v.optional(v.array(v.number())),
    metadata: v.optional(v.object({
      source: v.optional(v.string()),
      taskId: v.optional(v.id("tasks")),
      confidence: v.optional(v.number()),
      tags: v.optional(v.array(v.string())),
    })),
    importance: v.number(),
    lastAccessedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_squadId", ["squadId"])
    .index("by_type", ["type"])
    .index("by_importance", ["importance"]),

  // Integrations
  integrations: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("github"),
      v.literal("slack"),
      v.literal("discord"),
      v.literal("telegram"),
      v.literal("webhook"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("convex"),
      v.literal("custom")
    ),
    status: v.union(v.literal("connected"), v.literal("disconnected"), v.literal("error")),
    config: v.record(v.string(), v.any()),
    webhookUrl: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_type", ["type"]),

  // Analytics / Metrics
  metrics: defineTable({
    type: v.union(
      v.literal("task_completion_rate"),
      v.literal("agent_utilization"),
      v.literal("average_task_duration"),
      v.literal("workflow_execution_time"),
      v.literal("error_rate"),
      v.literal("token_usage"),
      v.literal("cost_per_task")
    ),
    value: v.number(),
    unit: v.optional(v.string()),
    labels: v.optional(v.record(v.string(), v.string())),
    agentId: v.optional(v.id("agents")),
    squadId: v.optional(v.id("squads")),
    timestamp: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"])
    .index("by_agentId", ["agentId"])
    .index("by_squadId", ["squadId"]),

  // Notifications
  notifications: defineTable({
    targetAgentId: v.id("agents"),
    content: v.string(),
    sourceTaskId: v.optional(v.id("tasks")),
    sourceMessageId: v.optional(v.id("messages")),
    delivered: v.boolean(),
    deliveredAt: v.optional(v.number()),
    error: v.optional(v.string()),
    attempts: v.optional(v.number()),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_targetAgentId", ["targetAgentId"])
    .index("by_delivered", ["delivered"]),

  // Task Subscriptions
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

  // Task Dispatches (for sub-agent spawning)
  taskDispatches: defineTable({
    taskId: v.id("tasks"),
    targetAgentId: v.optional(v.id("agents")),
    requestedBy: v.string(),
    prompt: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
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
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status_requestedAt", ["status", "requestedAt"]),

  // Settings
  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Heartbeats
  heartbeats: defineTable({
    agentId: v.id("agents"),
    status: v.union(
      v.literal("ok"),
      v.literal("working"),
      v.literal("blocked"),
      v.literal("error")
    ),
    message: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
    createdAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  // Assignments
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

  // Auth Profiles
  authProfiles: defineTable({
    email: v.string(),
    provider: v.string(),
    isActive: v.boolean(),
    profileId: v.string(),
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_isActive", ["isActive"]),
});
