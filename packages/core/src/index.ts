// Agent types
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  level: AgentLevel;
  status: AgentStatus;
  currentTaskId?: string;
  sessionKey: string;
  avatar?: string;
  systemPrompt?: string;
  character?: string;
  lore?: string;
  models: ModelConfig;
  squadId?: string;
  createdAt: number;
  updatedAt: number;
}

export type AgentRole = 
  | "orchestrator" 
  | "developer" 
  | "researcher" 
  | "reviewer" 
  | "tester"
  | "analyst"
  | "custom";

export type AgentLevel = "LEAD" | "INT" | "SPC";

export type AgentStatus = "idle" | "active" | "blocked" | "offline";

export interface ModelConfig {
  thinking: string;
  execution?: string;
  heartbeat: string;
  fallback: string;
}

// Squad types
export interface Squad {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  leadAgentId?: string;
  agentIds: string[];
  sharedMemory: SharedMemory;
  createdAt: number;
  updatedAt: number;
}

export interface SharedMemory {
  contextWindow: string[];
  documents: string[];
  preferences: Record<string, unknown>;
}

// Task types
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: string;
  assigneeIds: string[];
  squadId?: string;
  createdBy: string;
  tags?: string[];
  workflowNodeId?: string;
  sessionKey?: string;
  openclawRunId?: string;
  source?: string;
  startedAt?: number;
  lastEventAt?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  planningStatus?: PlanningStatus;
  planningQuestions?: string[];
  planningDraft?: string;
  metadata?: TaskMetadata;
}

export type TaskStatus = 
  | "inbox" 
  | "assigned" 
  | "in_progress" 
  | "testing" 
  | "review" 
  | "done" 
  | "blocked" 
  | "archived";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type PlanningStatus = "none" | "questions" | "ready" | "approved";

export interface TaskMetadata {
  estimatedHours?: number;
  actualHours?: number;
  complexity?: "low" | "medium" | "high";
  reviewCycles?: number;
}

// Workflow types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  triggerType: WorkflowTrigger;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export type NodeType = 
  | "trigger" 
  | "agent" 
  | "condition" 
  | "action" 
  | "wait" 
  | "parallel" 
  | "join";

export interface NodeData {
  label: string;
  config?: Record<string, unknown>;
  agentId?: string;
  squadId?: string;
  prompt?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export type WorkflowTrigger = 
  | "manual" 
  | "task_created" 
  | "task_completed" 
  | "schedule" 
  | "webhook";

// Message types
export interface Message {
  id: string;
  taskId?: string;
  fromAgentId?: string;
  fromUser?: boolean;
  content: string;
  mentions?: string[];
  channel: string;
  metadata?: MessageMetadata;
  createdAt: number;
}

export interface MessageMetadata {
  edited?: boolean;
  editedAt?: number;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "file" | "image" | "code";
  name: string;
  url: string;
  size?: number;
}

// Document types
export interface Document {
  id: string;
  title: string;
  content: string;
  type: DocumentType;
  path?: string;
  taskId?: string;
  projectId?: string;
  agentId?: string;
  embeddings?: number[];
  metadata?: DocumentMetadata;
  createdAt: number;
  updatedAt: number;
}

export type DocumentType = "deliverable" | "research" | "spec" | "note" | "markdown";

export interface DocumentMetadata {
  wordCount?: number;
  readingTime?: number;
  tags?: string[];
  source?: string;
}

// Activity types
export interface Activity {
  id: string;
  type: ActivityType;
  agentId?: string;
  taskId?: string;
  projectId?: string;
  squadId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type ActivityType = 
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "message_sent"
  | "agent_status_changed"
  | "document_created"
  | "dispatch_started"
  | "dispatch_completed"
  | "testing_result"
  | "planning_update"
  | "subagent_update"
  | "workflow_triggered"
  | "squad_formed"
  | "integration_connected";

// Integration types
export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  status: "connected" | "disconnected" | "error";
  config: Record<string, unknown>;
  webhookUrl?: string;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type IntegrationType = 
  | "github" 
  | "slack" 
  | "discord" 
  | "telegram"
  | "webhook"
  | "openai"
  | "anthropic"
  | "convex"
  | "custom";

// Analytics types
export interface Metric {
  id: string;
  type: MetricType;
  value: number;
  unit?: string;
  labels?: Record<string, string>;
  timestamp: number;
}

export type MetricType = 
  | "task_completion_rate"
  | "agent_utilization"
  | "average_task_duration"
  | "workflow_execution_time"
  | "error_rate"
  | "token_usage"
  | "cost_per_task";

export interface PerformanceReport {
  agentId?: string;
  squadId?: string;
  period: { start: number; end: number };
  metrics: Metric[];
  summary: ReportSummary;
  generatedAt: number;
}

export interface ReportSummary {
  totalTasks: number;
  completedTasks: number;
  averageCompletionTime: number;
  topBottlenecks: string[];
  recommendations: string[];
}

// Memory types
export interface MemoryEntry {
  id: string;
  agentId?: string;
  squadId?: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata?: MemoryMetadata;
  importance: number;
  lastAccessedAt: number;
  createdAt: number;
}

export type MemoryType = "conversation" | "fact" | "preference" | "skill" | "feedback";

export interface MemoryMetadata {
  source?: string;
  taskId?: string;
  confidence?: number;
  tags?: string[];
}

// Constants
export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#6b7280",
  active: "#10b981",
  blocked: "#ef4444",
  offline: "#374151",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  inbox: "#6b7280",
  assigned: "#3b82f6",
  in_progress: "#f59e0b",
  testing: "#8b5cf6",
  review: "#ec4899",
  done: "#10b981",
  blocked: "#ef4444",
  archived: "#374151",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "#6b7280",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

// Utility functions
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function timestamp(): number {
  return Date.now();
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function calculateSimilarity(embedding1: number[], embedding2: number[]): number {
  const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
}
