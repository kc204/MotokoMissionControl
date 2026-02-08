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

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export default function SettingsPage() {
  const config = useQuery(api.settings.getAutomationConfig);
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm"
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
          <span className="text-xs text-zinc-400">{status}</span>
        </div>
      </section>

      <div className="mt-6">
        <AgentStudioPanel />
      </div>
    </main>
  );
}
