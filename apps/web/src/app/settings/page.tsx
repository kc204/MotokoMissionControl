"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@motoko/db";

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

export default function SettingsPage() {
  const settingsRowQuery = useQuery(api.settings.get, { key: "automation:config" });
  const updateSetting = useMutation(api.settings.set);

  const settingsRow = (settingsRowQuery ?? null) as { value?: unknown } | null;
  const config = ((settingsRow?.value as AutomationConfig | undefined) ?? DEFAULT_CONFIG) as AutomationConfig;

  const [form, setForm] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    if (!config) return;
    setForm(config);
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

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-zinc-300">
              Operations metrics are unavailable on this deployment version.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Deploy the latest Convex backend to enable live ops telemetry.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
