import { Agent, Task } from "@motoko/core";

export interface AgentRuntime {
  agent: Agent;
  executeTask(task: Task): Promise<void>;
  sendHeartbeat(): Promise<void>;
}

export class OpenClawRuntime implements AgentRuntime {
  constructor(public agent: Agent) {}
  
  async executeTask(task: Task): Promise<void> {
    console.log(`Executing task ${task.id}`);
  }
  
  async sendHeartbeat(): Promise<void> {
    console.log("Heartbeat");
  }
}
