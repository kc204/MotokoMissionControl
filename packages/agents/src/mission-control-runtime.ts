import { ConvexHttpClient } from "convex/browser";
import { api } from "@motoko/db";
import type { DispatchClaim, NotificationClaim, RuntimeConfig } from "./runtime";
import { OpenClawTransport, OpenClawResult } from "./openclaw";

export class MissionControlRuntime {
  private client: ConvexHttpClient;
  private config: Required<RuntimeConfig>;
  private isRunning = false;
  private activeDispatches = new Set<string>();
  private activeNotifications = new Set<string>();
  private checkInterval?: NodeJS.Timeout;

  constructor(config: RuntimeConfig) {
    this.config = {
      convexUrl: config.convexUrl,
      runnerId: config.runnerId || `runtime:${process.env.HOSTNAME || "unknown"}:${process.pid}`,
      concurrency: config.concurrency || 3,
      claimTtlMs: config.claimTtlMs || 60_000,
    };
    
    this.client = new ConvexHttpClient(this.config.convexUrl);
  }

  /**
   * Start the runtime and begin subscribing to task dispatches and notifications
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[MissionControlRuntime] Already running");
      return;
    }

    console.log(`[MissionControlRuntime] Starting runner=${this.config.runnerId}`);
    this.isRunning = true;

    // Start polling for work - ConvexClient.subscribe is for React hooks
    // We use polling in Node.js environment instead
    this.startPolling();

    console.log("[MissionControlRuntime] Polling started");
  }

  /**
   * Stop the runtime and clean up
   */
  stop(): void {
    if (!this.isRunning) return;
    
    console.log("[MissionControlRuntime] Stopping...");
    this.isRunning = false;
    
    // Clear polling interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    console.log("[MissionControlRuntime] Stopped");
  }

  private startPolling(): void {
    // Poll every 2 seconds for new work
    this.checkInterval = setInterval(() => {
      if (!this.isRunning) return;
      
      // Check for pending dispatches
      if (this.activeDispatches.size < this.config.concurrency) {
        this.processNextDispatch();
      }
      
      // Check for undelivered notifications
      if (this.activeNotifications.size < this.config.concurrency) {
        this.processNextNotification();
      }
    }, 2000);

    // Initial check
    this.processNextDispatch();
    this.processNextNotification();
  }

  private async processNextDispatch(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeDispatches.size >= this.config.concurrency) return;

    try {
      // Use watchQuery for reactive updates (WebSocket-based)
      const hasPending = await this.client.query(api.taskDispatches.hasPending, {});
      
      if (!hasPending) return;

      // Claim the next dispatch
      const claim = await this.client.mutation(
        api.taskDispatches.claimNext,
        { runnerId: this.config.runnerId }
      ) as DispatchClaim | null;

      if (!claim) return;

      // Check if we're already processing this dispatch
      if (this.activeDispatches.has(claim.dispatchId)) return;

      this.activeDispatches.add(claim.dispatchId);

      // Process the dispatch
      this.handleDispatch(claim).finally(() => {
        this.activeDispatches.delete(claim.dispatchId);
      });
    } catch (error) {
      console.error("[MissionControlRuntime] Error claiming dispatch:", error);
    }
  }

  private async processNextNotification(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeNotifications.size >= this.config.concurrency) return;

    try {
      // Check for undelivered notifications
      const hasUndelivered = await this.client.query(api.notifications.hasUndelivered, {});
      
      if (!hasUndelivered) return;

      // Claim the next notification
      const claim = await this.client.mutation(
        api.notifications.claimNext,
        { 
          runnerId: this.config.runnerId,
          claimTtlMs: this.config.claimTtlMs 
        }
      ) as NotificationClaim | null;

      if (!claim) return;

      // Check if we're already processing this notification
      if (this.activeNotifications.has(claim.notificationId)) return;

      this.activeNotifications.add(claim.notificationId);

      // Process the notification
      this.handleNotification(claim).finally(() => {
        this.activeNotifications.delete(claim.notificationId);
      });
    } catch (error) {
      console.error("[MissionControlRuntime] Error claiming notification:", error);
    }
  }

  private async handleDispatch(claim: DispatchClaim): Promise<void> {
    console.log(`[Dispatch] Starting ${claim.dispatchId} for task ${claim.taskId}`);

    if (!claim.targetSessionKey) {
      console.error(`[Dispatch] No session key for dispatch ${claim.dispatchId}`);
      await this.failDispatch(claim.dispatchId, "No target session key available");
      return;
    }

    try {
      // Create OpenClaw transport
      const transport = new OpenClawTransport({
        agentId: claim.targetAgentId || "main",
        sessionKey: claim.targetSessionKey,
      });

      // Build the prompt
      const prompt = this.buildTaskPrompt(claim);

      // Execute the task via OpenClaw
      const result = await transport.executeTaskPrompt(prompt);

      // Extract result text
      const responseText = this.extractResponseText(result);
      const preview = this.truncate(responseText || "Task completed", 800);

      console.log(`[Dispatch] Completed ${claim.dispatchId}: ${preview}`);

      // Mark dispatch as complete
      await this.client.mutation(api.taskDispatches.complete, {
        dispatchId: claim.dispatchId as any,
        runId: result.runId,
        resultPreview: preview,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Dispatch] Failed ${claim.dispatchId}:`, errorMessage);
      await this.failDispatch(claim.dispatchId, errorMessage);
    }
  }

  private async handleNotification(claim: NotificationClaim): Promise<void> {
    console.log(`[Notification] Delivering ${claim.notificationId} to ${claim.targetAgentId}`);

    if (!claim.targetSessionKey) {
      console.error(`[Notification] No session key for notification ${claim.notificationId}`);
      await this.failNotification(claim.notificationId, "No target session key available");
      return;
    }

    try {
      // Create OpenClaw transport
      const transport = new OpenClawTransport({
        agentId: claim.targetAgentId,
        sessionKey: claim.targetSessionKey,
      });

      // Send the notification
      await transport.sendNotification(claim.content);

      console.log(`[Notification] Delivered ${claim.notificationId}`);

      // Mark notification as delivered
      await this.client.mutation(api.notifications.markDelivered, {
        id: claim.notificationId as any,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Notification] Failed ${claim.notificationId}:`, errorMessage);
      await this.failNotification(claim.notificationId, errorMessage);
    }
  }

  private async failDispatch(dispatchId: string, error: string): Promise<void> {
    try {
      await this.client.mutation(api.taskDispatches.fail, {
        dispatchId: dispatchId as any,
        error,
      });
    } catch (e) {
      console.error(`[Dispatch] Failed to mark dispatch as failed:`, e);
    }
  }

  private async failNotification(notificationId: string, error: string): Promise<void> {
    try {
      await this.client.mutation(api.notifications.markAttemptFailed, {
        id: notificationId as any,
        error,
      });
    } catch (e) {
      console.error(`[Notification] Failed to mark notification as failed:`, e);
    }
  }

  private buildTaskPrompt(claim: DispatchClaim): string {
    const title = claim.taskTitle || "Untitled Task";
    const description = claim.taskDescription || "No description provided.";
    const prompt = claim.prompt;

    const parts = [
      `Task: ${title}`,
      "",
      "Description:",
      description,
      "",
    ];

    if (prompt) {
      parts.push("Additional Instructions:",
        prompt,
        "",
      );
    }

    parts.push(
      "Please complete this task and provide a summary of what was done."
    );

    return parts.join("\n");
  }

  private extractResponseText(result: OpenClawResult): string {
    const payloads = result.result?.payloads ?? result.payloads ?? [];
    return payloads
      .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 3)}...`;
  }

  get status(): { isRunning: boolean; activeDispatches: number; activeNotifications: number } {
    return {
      isRunning: this.isRunning,
      activeDispatches: this.activeDispatches.size,
      activeNotifications: this.activeNotifications.size,
    };
  }
}
