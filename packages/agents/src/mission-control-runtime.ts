import { ConvexHttpClient } from "convex/browser";
import { api } from "@motoko/db";
import type { DispatchClaim, NotificationClaim, RuntimeConfig } from "./runtime";
import { OpenClawTransport, OpenClawResult } from "./openclaw";

interface AutomationConfig {
  autoDispatchEnabled: boolean;
  notificationDeliveryEnabled: boolean;
  notificationBatchSize: number;
  heartbeatEnabled: boolean;
}

interface RuntimeAgentRow {
  _id: string;
  name: string;
  sessionKey: string;
  level?: "LEAD" | "INT" | "SPC";
  status: "idle" | "active" | "blocked" | "offline";
}

interface RuntimeSettingRow {
  value?: unknown;
}

interface RuntimeHqMessageRow {
  _id: string;
  content?: string;
  fromUser?: boolean;
  fromAgentId?: string;
  mentions?: string[];
}

const WATCHER_LEASE_KEY = "watcher:leader";
const HQ_MANUAL_DISPATCH_KEY = "orchestrator:manual_dispatch";
const HQ_LAST_MESSAGE_KEY = "orchestrator:last_hq_message_id";
const HQ_LAST_MANUAL_TOKEN_KEY = "orchestrator:last_manual_dispatch";
const LEASE_TTL_MS = 15_000;
const CONFIG_REFRESH_MS = 5_000;
const AGENT_CACHE_MS = 5_000;

const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  autoDispatchEnabled: true,
  notificationDeliveryEnabled: true,
  notificationBatchSize: 10,
  heartbeatEnabled: true,
};

export class MissionControlRuntime {
  private client: ConvexHttpClient;
  private config: Required<RuntimeConfig>;
  private isRunning = false;
  private activeDispatches = new Set<string>();
  private activeNotifications = new Set<string>();
  private checkInterval?: NodeJS.Timeout;
  private tickInFlight = false;
  private cachedAutomationConfig: AutomationConfig = DEFAULT_AUTOMATION_CONFIG;
  private automationConfigFetchedAt = 0;
  private lastLeaseRenewedAt = 0;
  private leaseOwned = false;
  private lastLeaseWarningAt = 0;
  private hqInFlight = false;
  private cachedAgents: RuntimeAgentRow[] = [];
  private agentsFetchedAt = 0;
  private lastKnownHqMessageId: string | null = null;
  private lastKnownManualDispatchToken: string | null = null;

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

    void this.releaseLease();
    console.log("[MissionControlRuntime] Stopped");
  }

  private startPolling(): void {
    // Poll every 2 seconds for new work
    this.checkInterval = setInterval(() => {
      void this.tick();
    }, 2000);

    // Initial check
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.tickInFlight) return;
    this.tickInFlight = true;

    try {
      const automation = await this.getAutomationConfig();
      await this.refreshLease(automation);

      if (automation.autoDispatchEnabled && this.activeDispatches.size < this.config.concurrency) {
        await this.processNextDispatch();
      }

      const notificationConcurrency = Math.max(
        1,
        Math.min(this.config.concurrency, automation.notificationBatchSize || this.config.concurrency)
      );
      if (
        automation.notificationDeliveryEnabled &&
        this.activeNotifications.size < notificationConcurrency
      ) {
        await this.processNextNotification();
      }

      if (automation.autoDispatchEnabled) {
        await this.processHqChannel();
      }
    } catch (error) {
      console.error("[MissionControlRuntime] Tick failed:", error);
    } finally {
      this.tickInFlight = false;
    }
  }

  private normalizeAutomationConfig(value: unknown): AutomationConfig {
    if (!value || typeof value !== "object") {
      return DEFAULT_AUTOMATION_CONFIG;
    }

    const raw = value as Record<string, unknown>;

    const autoDispatchEnabled =
      typeof raw.autoDispatchEnabled === "boolean"
        ? raw.autoDispatchEnabled
        : DEFAULT_AUTOMATION_CONFIG.autoDispatchEnabled;

    const notificationDeliveryEnabled =
      typeof raw.notificationDeliveryEnabled === "boolean"
        ? raw.notificationDeliveryEnabled
        : DEFAULT_AUTOMATION_CONFIG.notificationDeliveryEnabled;

    const notificationBatchSize = Number.isFinite(raw.notificationBatchSize)
      ? Math.max(1, Math.min(50, Math.round(raw.notificationBatchSize as number)))
      : DEFAULT_AUTOMATION_CONFIG.notificationBatchSize;

    const heartbeatEnabled =
      typeof raw.heartbeatEnabled === "boolean"
        ? raw.heartbeatEnabled
        : DEFAULT_AUTOMATION_CONFIG.heartbeatEnabled;

    return {
      autoDispatchEnabled,
      notificationDeliveryEnabled,
      notificationBatchSize,
      heartbeatEnabled,
    };
  }

  private async getAutomationConfig(): Promise<AutomationConfig> {
    const now = Date.now();
    if (now - this.automationConfigFetchedAt < CONFIG_REFRESH_MS) {
      return this.cachedAutomationConfig;
    }

    try {
      const config = await this.client.query(api.settings.getAutomationConfig, {});
      this.cachedAutomationConfig = this.normalizeAutomationConfig(config);
      this.automationConfigFetchedAt = now;
      return this.cachedAutomationConfig;
    } catch (error) {
      console.warn("[MissionControlRuntime] Falling back to cached automation config:", error);
      this.automationConfigFetchedAt = now;
      return this.cachedAutomationConfig;
    }
  }

  private async refreshLease(automation: AutomationConfig): Promise<void> {
    const now = Date.now();

    if (!automation.heartbeatEnabled) {
      if (this.leaseOwned) {
        await this.releaseLease();
      }
      return;
    }

    if (now - this.lastLeaseRenewedAt < LEASE_TTL_MS / 2) {
      return;
    }

    try {
      const lease = (await this.client.mutation(api.settings.acquireLease, {
        key: WATCHER_LEASE_KEY,
        owner: this.config.runnerId,
        ttlMs: LEASE_TTL_MS,
      })) as { acquired?: boolean; owner?: string | null; expiresAt?: number };

      this.lastLeaseRenewedAt = now;
      this.leaseOwned = Boolean(lease?.acquired);

      if (!lease?.acquired && now - this.lastLeaseWarningAt > 15_000) {
        this.lastLeaseWarningAt = now;
        console.warn(
          `[MissionControlRuntime] watcher lease held by ${lease?.owner || "unknown"}`
        );
      }
    } catch (error) {
      console.warn("[MissionControlRuntime] Failed to refresh watcher lease:", error);
    }
  }

  private async releaseLease(): Promise<void> {
    try {
      await this.client.mutation(api.settings.releaseLease, {
        key: WATCHER_LEASE_KEY,
        owner: this.config.runnerId,
      });
    } catch (error) {
      console.warn("[MissionControlRuntime] Failed to release watcher lease:", error);
    } finally {
      this.leaseOwned = false;
    }
  }

  private async processNextDispatch(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeDispatches.size >= this.config.concurrency) return;

    try {
      const hasPending = await this.client.query(api.taskDispatches.hasPending, {});
      if (!hasPending) return;

      // Claim the next dispatch
      const claim = (await this.client.mutation(api.taskDispatches.claimNext, {
        runnerId: this.config.runnerId,
      })) as DispatchClaim | null;

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
      const hasUndelivered = await this.client.query(api.notifications.hasUndelivered, {});
      if (!hasUndelivered) return;

      // Claim the next notification
      const claim = (await this.client.mutation(api.notifications.claimNext, {
        runnerId: this.config.runnerId,
        claimTtlMs: this.config.claimTtlMs,
      })) as NotificationClaim | null;

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

  private parseMentions(content: string): string[] {
    const matches = content.match(/@([a-zA-Z0-9_]+)/g) ?? [];
    return Array.from(new Set(matches.map((item) => item.toLowerCase())));
  }

  private async getAgents(force = false): Promise<RuntimeAgentRow[]> {
    const now = Date.now();
    if (!force && now - this.agentsFetchedAt < AGENT_CACHE_MS) {
      return this.cachedAgents;
    }
    const agents = (await this.client.query(api.agents.list, {})) as RuntimeAgentRow[];
    this.cachedAgents = agents;
    this.agentsFetchedAt = now;
    return agents;
  }

  private resolveHqTargets(message: RuntimeHqMessageRow, agents: RuntimeAgentRow[]): RuntimeAgentRow[] {
    const content = (message.content ?? "").trim();
    const mentionSet = new Set<string>([
      ...(Array.isArray(message.mentions) ? message.mentions.map((m) => String(m).toLowerCase()) : []),
      ...this.parseMentions(content),
    ]);

    const available = agents.filter((agent) => agent.status !== "offline");
    if (available.length === 0) return [];

    if (mentionSet.has("@all")) {
      return available.filter((agent) => agent.status !== "blocked");
    }

    const byName = new Map(available.map((agent) => [agent.name.toLowerCase(), agent]));
    const explicitTargets = Array.from(mentionSet)
      .filter((mention) => mention.startsWith("@"))
      .map((mention) => byName.get(mention.slice(1)))
      .filter((agent): agent is RuntimeAgentRow => Boolean(agent))
      .filter((agent) => agent.status !== "blocked");

    if (explicitTargets.length > 0) {
      const deduped = new Map(explicitTargets.map((agent) => [agent._id, agent]));
      return Array.from(deduped.values());
    }

    const lead =
      available.find((agent) => agent.level === "LEAD" && agent.status !== "blocked") ??
      available.find((agent) => agent.name.toLowerCase() === "motoko" && agent.status !== "blocked") ??
      available.find((agent) => agent.status === "active") ??
      available.find((agent) => agent.status === "idle");

    return lead ? [lead] : [];
  }

  private buildHqPrompt(content: string): string {
    return [
      "You are responding in Mission Control HQ chat.",
      "",
      "User message:",
      content || "(empty message)",
      "",
      "Respond as this agent in 2-6 concise sentences with actionable detail.",
      "If you need input from another specialist, explicitly @mention them.",
    ].join("\n");
  }

  private async setAgentStatus(agentId: string, status: "idle" | "active"): Promise<void> {
    try {
      await this.client.mutation(api.agents.update, {
        id: agentId as any,
        status,
      });
    } catch (error) {
      console.warn(`[MissionControlRuntime] Failed to set agent status ${agentId} -> ${status}:`, error);
    }
  }

  private async rememberHqCursor(messageId: string, manualDispatchToken: string | null): Promise<void> {
    this.lastKnownHqMessageId = messageId;
    if (manualDispatchToken !== null) {
      this.lastKnownManualDispatchToken = manualDispatchToken;
    }

    const writes: Array<Promise<unknown>> = [
      this.client.mutation(api.settings.set, {
        key: HQ_LAST_MESSAGE_KEY,
        value: messageId,
      }),
    ];

    if (manualDispatchToken !== null) {
      writes.push(
        this.client.mutation(api.settings.set, {
          key: HQ_LAST_MANUAL_TOKEN_KEY,
          value: manualDispatchToken,
        })
      );
    }

    await Promise.all(writes);
  }

  private async processHqChannel(): Promise<void> {
    if (!this.isRunning || !this.leaseOwned || this.hqInFlight) return;
    this.hqInFlight = true;

    try {
      const [latestUserMessage, manualDispatchRow, lastMessageRow, lastManualRow] = await Promise.all([
        this.client.query(api.messages.latestUserForChannel, {
          channel: "hq",
          scanLimit: 120,
        }) as Promise<RuntimeHqMessageRow | null>,
        this.client.query(api.settings.get, { key: HQ_MANUAL_DISPATCH_KEY }) as Promise<RuntimeSettingRow | null>,
        this.client.query(api.settings.get, { key: HQ_LAST_MESSAGE_KEY }) as Promise<RuntimeSettingRow | null>,
        this.client.query(api.settings.get, { key: HQ_LAST_MANUAL_TOKEN_KEY }) as Promise<RuntimeSettingRow | null>,
      ]);

      if (!latestUserMessage?._id) return;

      const latestMessageId = String(latestUserMessage._id);
      const manualDispatchToken =
        typeof manualDispatchRow?.value === "string" ? manualDispatchRow.value : null;
      const persistedLastMessageId =
        typeof lastMessageRow?.value === "string" ? lastMessageRow.value : this.lastKnownHqMessageId;
      const persistedLastManualToken =
        typeof lastManualRow?.value === "string"
          ? lastManualRow.value
          : this.lastKnownManualDispatchToken;

      const hasNewUserMessage =
        !latestUserMessage.fromAgentId &&
        (latestUserMessage.fromUser ?? true) &&
        latestMessageId !== persistedLastMessageId;
      const hasManualDispatch =
        !!manualDispatchToken && manualDispatchToken !== persistedLastManualToken;

      if (!hasNewUserMessage && !hasManualDispatch) {
        return;
      }

      const agents = await this.getAgents();
      const targets = this.resolveHqTargets(latestUserMessage, agents);
      if (targets.length === 0) {
        await this.rememberHqCursor(latestMessageId, manualDispatchToken);
        return;
      }

      const prompt = this.buildHqPrompt(latestUserMessage.content ?? "");
      for (const target of targets) {
        if (!target.sessionKey) continue;

        await this.setAgentStatus(target._id, "active");
        try {
          const transport = new OpenClawTransport({
            agentId: target.name.toLowerCase(),
            sessionKey: target.sessionKey,
          });
          const result = await transport.sendMessage(prompt);
          const responseText = this.extractResponseText(result).trim();

          if (responseText) {
            await this.client.mutation(api.messages.send, {
              channel: "hq",
              content: responseText,
              fromAgentId: target._id as any,
              fromUser: false,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[MissionControlRuntime] HQ response failed for ${target.name}:`, message);
        } finally {
          await this.setAgentStatus(target._id, "idle");
        }
      }

      await this.rememberHqCursor(latestMessageId, manualDispatchToken);
    } catch (error) {
      console.error("[MissionControlRuntime] HQ orchestration failed:", error);
    } finally {
      this.hqInFlight = false;
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

    const parts = [`Task: ${title}`, "", "Description:", description, ""];

    if (prompt) {
      parts.push("Additional Instructions:", prompt, "");
    }

    parts.push("Please complete this task and provide a summary of what was done.");

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
