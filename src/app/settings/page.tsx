"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AgentStudioPanel from "@/components/AgentStudioPanel";

type AutomationForm = {
  autoDispatchEnabled: boolean;
  notificationDeliveryEnabled: boolean;
  notificationBatchSize: number;
  heartbeatEnabled: boolean;
  heartbeatMaxNotifications: number;
  heartbeatMaxTasks: number;
  heartbeatMaxActivities: number;
  heartbeatRequireChatUpdate: boolean;
};

type WiringState = "live" | "partial" | "not_wired";

const DEFAULT_FORM: AutomationForm = {
  autoDispatchEnabled: true,
  notificationDeliveryEnabled: true,
  notificationBatchSize: 10,
  heartbeatEnabled: true,
  heartbeatMaxNotifications: 3,
  heartbeatMaxTasks: 3,
  heartbeatMaxActivities: 4,
  heartbeatRequireChatUpdate: false,
};

function WiringBadge({ state }: { state: WiringState }) {
  const meta =
    state === "live"
      ? {
          label: "Live",
          className:
            "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
        }
      : state === "partial"
      ? {
          label: "Partial",
          className: "border-amber-400/40 bg-amber-500/10 text-amber-200",
        }
      : {
          label: "Not wired",
          className: "border-rose-400/40 bg-rose-500/10 text-rose-200",
        };

  return (
    <span
      title={
        state === "live"
          ? "This control is actively consumed by runtime scripts."
          : state === "partial"
          ? "This control influences behavior, but is not strictly enforced end-to-end."
          : "This value is saved but not currently consumed by runtime automation."
      }
      className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function WiringHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-[10px] font-bold text-zinc-300"
      aria-label={text}
    >
      i
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatRelativeTime(ts?: number | null) {
  if (!ts || !Number.isFinite(ts)) return "n/a";
  const delta = Date.now() - ts;
  if (delta < 1000) return "just now";
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function SettingsPage() {
  const config = useQuery(api.settings.getAutomationConfig);
  const ops = useQuery(api.ops.overview);
  const updateConfig = useMutation(api.settings.updateAutomationConfig);
  const [form, setForm] = useState<AutomationForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!config) return;
    setForm({
      autoDispatchEnabled: config.autoDispatchEnabled,
      notificationDeliveryEnabled: config.notificationDeliveryEnabled,
      notificationBatchSize: config.notificationBatchSize,
      heartbeatEnabled: config.heartbeatEnabled,
      heartbeatMaxNotifications: config.heartbeatMaxNotifications,
      heartbeatMaxTasks: config.heartbeatMaxTasks,
      heartbeatMaxActivities: config.heartbeatMaxActivities,
      heartbeatRequireChatUpdate: config.heartbeatRequireChatUpdate,
    });
    setIsDirty(false);
  }, [config]);

  const save = async () => {
    setIsSaving(true);
    setStatus("");
    try {
      await updateConfig({
        autoDispatchEnabled: form.autoDispatchEnabled,
        notificationDeliveryEnabled: form.notificationDeliveryEnabled,
        notificationBatchSize: clamp(form.notificationBatchSize, 1, 50),
        heartbeatEnabled: form.heartbeatEnabled,
        heartbeatMaxNotifications: clamp(form.heartbeatMaxNotifications, 1, 20),
        heartbeatMaxTasks: clamp(form.heartbeatMaxTasks, 1, 20),
        heartbeatMaxActivities: clamp(form.heartbeatMaxActivities, 1, 30),
        heartbeatRequireChatUpdate: form.heartbeatRequireChatUpdate,
      });
      setStatus("Saved.");
      setIsDirty(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <main className="min-h-[calc(100vh-7rem)] text-white">
        <div className="h-10 w-72 animate-pulse rounded bg-white/10" />
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-7rem)] text-white">
      <header className="mb-6 border-b border-white/10 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Automation Settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Control dispatch, delivery, and heartbeat load without changing env files.
        </p>
      </header>

      <section className="max-w-3xl rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-sm text-zinc-200">
              Auto Dispatch
              <WiringBadge state="not_wired" />
              <WiringHint text="Saved in automation config, but no watcher/orchestrator path currently checks this flag." />
            </span>
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
            <span className="text-sm text-zinc-200">
              Notification Delivery
              <WiringBadge state="live" />
              <WiringHint text="poll-notifications reads this flag and skips delivery when disabled." />
            </span>
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
            <p className="mb-2 text-sm text-zinc-200">
              Notification Batch Size
              <WiringBadge state="live" />
              <WiringHint text="poll-notifications uses this as the limit for each undelivered notification batch." />
            </p>
            <input
              type="number"
              min={1}
              max={50}
              value={form.notificationBatchSize}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, notificationBatchSize: Number(e.target.value) }));
                setIsDirty(true);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-sm text-zinc-200">
              Heartbeat Enabled
              <WiringBadge state="live" />
              <WiringHint text="heartbeat-orchestrator exits early when this is off." />
            </span>
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
            <p className="mb-2 text-sm text-zinc-200">
              Heartbeat Max Notifications
              <WiringBadge state="partial" />
              <WiringHint text="Read by heartbeat prompt assembly, but current prompt mostly reflects counts rather than strict per-item truncation." />
            </p>
            <input
              type="number"
              min={1}
              max={20}
              value={form.heartbeatMaxNotifications}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, heartbeatMaxNotifications: Number(e.target.value) }));
                setIsDirty(true);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>

          <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="mb-2 text-sm text-zinc-200">
              Heartbeat Max Tasks
              <WiringBadge state="partial" />
              <WiringHint text="Read by heartbeat prompt assembly, but current prompt mostly reflects counts rather than strict per-item truncation." />
            </p>
            <input
              type="number"
              min={1}
              max={20}
              value={form.heartbeatMaxTasks}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, heartbeatMaxTasks: Number(e.target.value) }));
                setIsDirty(true);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>

          <label className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="mb-2 text-sm text-zinc-200">
              Heartbeat Max Activity Items
              <WiringBadge state="live" />
              <WiringHint text="Used directly as the query limit for recent activity in heartbeat-orchestrator." />
            </p>
            <input
              type="number"
              min={1}
              max={30}
              value={form.heartbeatMaxActivities}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, heartbeatMaxActivities: Number(e.target.value) }));
                setIsDirty(true);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-sm text-zinc-200">
              Heartbeat Requires Chat Update
              <WiringBadge state="partial" />
              <WiringHint text="Changes heartbeat prompt instructions, but enforcement depends on agent compliance rather than a hard gate." />
            </span>
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
          <span className="text-xs text-zinc-400">{status}</span>
        </div>
      </section>

      <section className="mt-6 max-w-5xl rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-zinc-100">Operations Dashboard</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Live queue, reliability, and watcher health for autonomous runs.
          </p>
        </div>
        {!ops ? (
          <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
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
              <p className="text-xs uppercase tracking-wider text-zinc-500">Dispatch Health</p>
              <p className="mt-2 text-sm text-zinc-200">
                Last started:{" "}
                {formatRelativeTime(
                  typeof (ops.dispatch.lastStarted as { at?: number } | null)?.at === "number"
                    ? (ops.dispatch.lastStarted as { at?: number }).at
                    : null
                )}
              </p>
              <p className="text-sm text-zinc-200">
                Last result: {(ops.dispatch.lastResult as { status?: string } | null)?.status ?? "n/a"}
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                Updated{" "}
                {formatRelativeTime(
                  typeof (ops.dispatch.lastResult as { at?: number } | null)?.at === "number"
                    ? (ops.dispatch.lastResult as { at?: number }).at
                    : null
                )}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Agents</p>
              <p className="mt-2 text-sm text-zinc-200">Total: {ops.agents.total}</p>
              <p className="text-sm text-zinc-200">Active: {ops.agents.active}</p>
              <p className="text-sm text-zinc-200">Blocked: {ops.agents.blocked}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Watcher + Delivery</p>
              <p className="mt-2 text-sm text-zinc-200">
                Watcher: {ops.watcher.isHealthy ? "healthy" : "stale"}
              </p>
              <p className="text-sm text-zinc-200">Owner: {ops.watcher.owner ?? "none"}</p>
              <p className="text-sm text-zinc-200">Undelivered notifications: {ops.notifications.undelivered}</p>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6">
        <AgentStudioPanel />
      </div>
    </main>
  );
}
