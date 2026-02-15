"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";

interface AutomationConfig {
  autoDispatchEnabled: boolean;
  notificationDeliveryEnabled: boolean;
  notificationBatchSize: number;
  heartbeatEnabled: boolean;
  heartbeatMaxNotifications: number;
  heartbeatMaxTasks: number;
  heartbeatMaxActivities: number;
  heartbeatRequireChatUpdate: boolean;
}

interface TaskRow {
  _id: Id<"tasks">;
  status: "inbox" | "assigned" | "in_progress" | "testing" | "review" | "done" | "blocked" | "archived";
}

interface OpsOverview {
  now: number;
  dispatch: {
    pending: number;
    running: number;
    recent24h: {
      completed: number;
      failed: number;
      cancelled: number;
    };
  };
  agents: {
    total: number;
    active: number;
    blocked: number;
    idle: number;
  };
  notifications: {
    undelivered: number;
  };
  watcher: {
    owner: string | null;
    expiresAt: number;
    isHealthy: boolean;
  };
}

const DEFAULT_CONFIG: AutomationConfig = {
  autoDispatchEnabled: true,
  notificationDeliveryEnabled: true,
  notificationBatchSize: 10,
  heartbeatEnabled: true,
  heartbeatMaxNotifications: 3,
  heartbeatMaxTasks: 3,
  heartbeatMaxActivities: 4,
  heartbeatRequireChatUpdate: false,
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sameAutomationConfig(a: AutomationConfig, b: AutomationConfig) {
  return (
    a.autoDispatchEnabled === b.autoDispatchEnabled &&
    a.notificationDeliveryEnabled === b.notificationDeliveryEnabled &&
    a.notificationBatchSize === b.notificationBatchSize &&
    a.heartbeatEnabled === b.heartbeatEnabled &&
    a.heartbeatMaxNotifications === b.heartbeatMaxNotifications &&
    a.heartbeatMaxTasks === b.heartbeatMaxTasks &&
    a.heartbeatMaxActivities === b.heartbeatMaxActivities &&
    a.heartbeatRequireChatUpdate === b.heartbeatRequireChatUpdate
  );
}

export default function SettingsPage() {
  const settingsRowQuery = useQuery(api.settings.get, { key: "automation:config" });
  const tasksQuery = useQuery(api.tasks.list, { limit: 250 });
  const opsQuery = useQuery(api.ops.overview);
  const updateSetting = useMutation(api.settings.set);

  const settingsRow = (settingsRowQuery ?? null) as { value?: unknown } | null;
  const config = ((settingsRow?.value as AutomationConfig | undefined) ?? DEFAULT_CONFIG) as AutomationConfig;
  const tasks = (tasksQuery ?? []) as TaskRow[];
  const opsOverview = (opsQuery ?? null) as OpsOverview | null;
  const opsLoading = tasksQuery === undefined || opsQuery === undefined;

  const ops = useMemo(() => {
    const now = opsOverview?.now ?? Date.now();
    const pipeline = {
      inbox: tasks.filter((task) => task.status === "inbox").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      review: tasks.filter((task) => task.status === "review").length,
      done: tasks.filter((task) => task.status === "done").length,
    };

    return {
      now,
      dispatch: {
        pending: opsOverview?.dispatch.pending ?? 0,
        running: opsOverview?.dispatch.running ?? 0,
        recent24h: {
          completed: opsOverview?.dispatch.recent24h.completed ?? 0,
          failed: opsOverview?.dispatch.recent24h.failed ?? 0,
          cancelled: opsOverview?.dispatch.recent24h.cancelled ?? 0,
        },
      },
      agents: {
        total: opsOverview?.agents.total ?? 0,
        active: opsOverview?.agents.active ?? 0,
        blocked: opsOverview?.agents.blocked ?? 0,
        idle: opsOverview?.agents.idle ?? 0,
      },
      pipeline,
      notifications: {
        undelivered: opsOverview?.notifications.undelivered ?? 0,
      },
      watcher: {
        owner: opsOverview?.watcher.owner ?? null,
        expiresAt: opsOverview?.watcher.expiresAt ?? 0,
        isHealthy: Boolean(opsOverview?.watcher.owner) && (opsOverview?.watcher.expiresAt ?? 0) > now,
      },
    };
  }, [opsOverview, tasks]);

  const [form, setForm] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    if (!config) return;
    setForm((prev) => (sameAutomationConfig(prev, config) ? prev : config));
    setIsDirty(false);
  }, [config]);

  const save = async () => {
    setIsSaving(true);
    setStatusText("");
    try {
      await updateSetting({
        key: "automation:config",
        value: {
          autoDispatchEnabled: form.autoDispatchEnabled,
          notificationDeliveryEnabled: form.notificationDeliveryEnabled,
          notificationBatchSize: clamp(form.notificationBatchSize, 1, 50),
          heartbeatEnabled: form.heartbeatEnabled,
          heartbeatMaxNotifications: clamp(form.heartbeatMaxNotifications, 1, 20),
          heartbeatMaxTasks: clamp(form.heartbeatMaxTasks, 1, 20),
          heartbeatMaxActivities: clamp(form.heartbeatMaxActivities, 1, 30),
          heartbeatRequireChatUpdate: form.heartbeatRequireChatUpdate,
        },
      });
      setStatusText("Saved.");
      setIsDirty(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 border-b border-white/10 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Settings
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Control runtime automation and monitor system health from one place.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-black/35 p-5">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Automation Controls</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-sm text-zinc-200">Auto Dispatch</span>
              <input
                type="checkbox"
                checked={form.autoDispatchEnabled}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, autoDispatchEnabled: e.target.checked }));
                  setIsDirty(true);
                }}
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-sm text-zinc-200">Notification Delivery</span>
              <input
                type="checkbox"
                checked={form.notificationDeliveryEnabled}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, notificationDeliveryEnabled: e.target.checked }));
                  setIsDirty(true);
                }}
              />
            </label>

            <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="mb-2 text-sm text-zinc-200">Notification Batch Size</p>
              <input
                type="number"
                min={1}
                max={50}
                value={form.notificationBatchSize}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, notificationBatchSize: Number(e.target.value) }));
                  setIsDirty(true);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-zinc-100"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-sm text-zinc-200">Heartbeat Enabled</span>
              <input
                type="checkbox"
                checked={form.heartbeatEnabled}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, heartbeatEnabled: e.target.checked }));
                  setIsDirty(true);
                }}
              />
            </label>

            <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="mb-2 text-sm text-zinc-200">Heartbeat Max Notifications</p>
              <input
                type="number"
                min={1}
                max={20}
                value={form.heartbeatMaxNotifications}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, heartbeatMaxNotifications: Number(e.target.value) }));
                  setIsDirty(true);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-zinc-100"
              />
            </label>

            <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="mb-2 text-sm text-zinc-200">Heartbeat Max Tasks</p>
              <input
                type="number"
                min={1}
                max={20}
                value={form.heartbeatMaxTasks}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, heartbeatMaxTasks: Number(e.target.value) }));
                  setIsDirty(true);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-zinc-100"
              />
            </label>

            <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="mb-2 text-sm text-zinc-200">Heartbeat Max Activity Items</p>
              <input
                type="number"
                min={1}
                max={30}
                value={form.heartbeatMaxActivities}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, heartbeatMaxActivities: Number(e.target.value) }));
                  setIsDirty(true);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-zinc-100"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-sm text-zinc-200">Heartbeat Requires Chat Update</span>
              <input
                type="checkbox"
                checked={form.heartbeatRequireChatUpdate}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, heartbeatRequireChatUpdate: e.target.checked }));
                  setIsDirty(true);
                }}
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              disabled={!isDirty || isSaving}
              onClick={save}
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
            <span className="text-xs text-zinc-400">{statusText}</span>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-zinc-100">Operations Dashboard</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Live queue depth, dispatch health, and watcher status.
            </p>
          </div>

          {opsLoading ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-zinc-300">Loading live operations metrics...</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Dispatch Queue</p>
                <p className="mt-2 text-sm text-zinc-200">Pending: {ops.dispatch.pending}</p>
                <p className="text-sm text-zinc-200">Running: {ops.dispatch.running}</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  24h: {ops.dispatch.recent24h.completed} done / {ops.dispatch.recent24h.failed} failed /{" "}
                  {ops.dispatch.recent24h.cancelled} cancelled
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Agents</p>
                <p className="mt-2 text-sm text-zinc-200">Total: {ops.agents.total}</p>
                <p className="text-sm text-zinc-200">Active: {ops.agents.active}</p>
                <p className="text-sm text-zinc-200">Blocked: {ops.agents.blocked}</p>
                <p className="text-sm text-zinc-200">Idle: {ops.agents.idle}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Pipeline</p>
                <p className="mt-2 text-sm text-zinc-200">Inbox: {ops.pipeline.inbox}</p>
                <p className="text-sm text-zinc-200">In Progress: {ops.pipeline.inProgress}</p>
                <p className="text-sm text-zinc-200">Review: {ops.pipeline.review}</p>
                <p className="text-sm text-zinc-200">Done: {ops.pipeline.done}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Watcher + Notifications</p>
                <p className="mt-2 text-sm text-zinc-200">
                  Watcher: {ops.watcher.isHealthy ? "healthy" : "stale"}
                </p>
                <p className="text-sm text-zinc-200">Owner: {ops.watcher.owner ?? "none"}</p>
                <p className="mt-2 text-sm text-zinc-200">
                  Undelivered: {ops.notifications.undelivered}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
