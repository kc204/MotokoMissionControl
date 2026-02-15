import { Task, Agent } from "@motoko/core";

export interface DispatchResult {
  success: boolean;
  taskId: string;
  agentId?: string;
  error?: string;
}

export class TaskDispatcher {
  async dispatch(task: Task, agents: Agent[]): Promise<DispatchResult> {
    const availableAgent = agents.find(a => a.status === "idle");
    
    if (!availableAgent) {
      return {
        success: false,
        taskId: task.id,
        error: "No available agents"
      };
    }
    
    return {
      success: true,
      taskId: task.id,
      agentId: availableAgent.id
    };
  }
  
  async dispatchToSquad(task: Task, squadId: string): Promise<DispatchResult> {
    console.log(`Dispatching task ${task.id} to squad ${squadId}`);
    return {
      success: true,
      taskId: task.id
    };
  }
}
