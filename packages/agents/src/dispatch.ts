import { DispatchClaim, NotificationClaim, type RuntimeConfig } from "./runtime";
import { MissionControlRuntime } from "./mission-control-runtime";
export { MissionControlRuntime };
export type { RuntimeConfig };
export { OpenClawTransport, type OpenClawResult, type OpenClawOptions } from "./openclaw";
export type { DispatchClaim, NotificationClaim };

// Backwards compatibility - TaskDispatcher is now deprecated in favor of MissionControlRuntime
export interface DispatchResult {
  success: boolean;
  taskId: string;
  agentId?: string;
  error?: string;
}

/**
 * @deprecated Use MissionControlRuntime instead
 */
export class TaskDispatcher {
  private runtime?: MissionControlRuntime;

  async start(config: RuntimeConfig): Promise<void> {
    this.runtime = new MissionControlRuntime(config);
    await this.runtime.start();
  }

  stop(): void {
    this.runtime?.stop();
  }

  async dispatchToSquad(taskId: string, squadId: string): Promise<DispatchResult> {
    console.log(`[TaskDispatcher] Dispatching task ${taskId} to squad ${squadId}`);
    return {
      success: true,
      taskId,
    };
  }
}
