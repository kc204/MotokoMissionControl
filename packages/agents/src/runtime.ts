import { Agent, Task } from "@motoko/core";

export interface AgentRuntime {
  agent: Agent;
  executeTask(task: Task): Promise<void>;
  sendHeartbeat(): Promise<void>;
}

export interface DispatchClaim {
  dispatchId: string;
  taskId: string;
  prompt: string | null;
  targetAgentId: string | null;
  targetSessionKey: string | null;
  taskTitle: string | null;
  taskDescription: string | null;
}

export interface NotificationClaim {
  notificationId: string;
  targetAgentId: string;
  targetSessionKey: string | null;
  content: string;
}

export interface RuntimeConfig {
  convexUrl: string;
  runnerId?: string;
  concurrency?: number;
  claimTtlMs?: number;
}
