"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";
import AgentCard from "@/components/AgentCard";
import AddAgentModal from "@/components/AddAgentModal";
import AgentDetailTray from "@/components/AgentDetailTray";

interface Agent {
  _id: Id<"agents">;
  name: string;
  role: string;
  status: "idle" | "active" | "blocked" | "offline";
  currentTaskId?: Id<"tasks">;
  models?: {
    thinking?: string;
    execution?: string;
    heartbeat?: string;
    fallback?: string;
  };
}

interface Task {
  _id: string;
  title: string;
  status: string;
  priority: string;
}

export default function HomePage() {
  const agents = (useQuery(api.agents.list) || []) as Agent[];
  const tasks = (useQuery(api.tasks.list, { limit: 100 }) || []) as Task[];

  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="relative min-h-full p-6 lg:p-8">
      {/* Grid background pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-cyan-500/[0.03]" />
      </div>

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-10 border-b border-white/10 pb-8">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Mission Control
              </h1>
              <p className="mt-3 text-2xl tracking-tight text-zinc-400">
                OpenClaw Agent Workforce
              </p>
            </div>
            <div className="min-w-24 text-right">
              <p className="text-5xl font-semibold leading-none text-white">{activeAgents}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">Active Agents</p>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Agents", value: agents.length, color: "text-zinc-200" },
            { label: "Active", value: activeAgents, color: "text-emerald-300" },
            { label: "Tasks", value: totalTasks, color: "text-cyan-300" },
            { label: "Completed", value: doneTasks, color: "text-amber-300" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6"
            >
              <p className="text-xs uppercase tracking-wider text-zinc-500">{stat.label}</p>
              <p className={`mt-2 text-4xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </section>

        {/* Agent Grid */}
        <section className="mb-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Agents</h2>
            <button
              onClick={() => setShowAddAgentModal(true)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
            >
              + Deploy New Agent
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent._id}
                id={agent._id}
                name={agent.name}
                role={agent.role}
                status={agent.status}
                currentTaskId={agent.currentTaskId}
                models={{
                  thinking: agent.models?.thinking || "kimi-coding/kimi-for-coding",
                  execution: agent.models?.execution,
                  heartbeat: agent.models?.heartbeat || "kimi-coding/kimi-for-coding",
                  fallback: agent.models?.fallback || "openai/gpt-4o-mini",
                }}
                onOpenDetails={setSelectedAgentId}
              />
            ))}

            {/* Deploy New Agent Button Card */}
            <button
              type="button"
              onClick={() => setShowAddAgentModal(true)}
              className="group flex min-h-[365px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-gradient-to-br from-white/[0.02] to-white/[0.01] transition-colors hover:border-white/25 hover:from-white/[0.04] hover:to-white/[0.02]"
            >
              <span className="text-sm font-medium tracking-wide text-zinc-400 transition-colors group-hover:text-zinc-200">
                Deploy New Agent
              </span>
            </button>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main Content */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link
                  href="/agents"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition-all hover:border-cyan-400/30 hover:bg-cyan-500/10"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">🤖</span>
                  <div>
                    <p className="font-medium text-white">Manage Agents</p>
                    <p className="text-xs text-zinc-500">View and configure agents</p>
                  </div>
                </Link>
                <Link
                  href="/tasks"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition-all hover:border-emerald-400/30 hover:bg-emerald-500/10"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">📋</span>
                  <div>
                    <p className="font-medium text-white">View Tasks</p>
                    <p className="text-xs text-zinc-500">Kanban board status</p>
                  </div>
                </Link>
                <Link
                  href="/hq"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition-all hover:border-amber-400/30 hover:bg-amber-500/10"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">💬</span>
                  <div>
                    <p className="font-medium text-white">HQ Chat</p>
                    <p className="text-xs text-zinc-500">Team communications</p>
                  </div>
                </Link>
                <Link
                  href="/workflows"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition-all hover:border-fuchsia-400/30 hover:bg-fuchsia-500/10"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-300">⚡</span>
                  <div>
                    <p className="font-medium text-white">Workflows</p>
                    <p className="text-xs text-zinc-500">Automated pipelines</p>
                  </div>
                </Link>
              </div>
            </section>

            {/* Task Overview */}
            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Recent Tasks</h2>
                <Link href="/tasks" className="text-xs text-cyan-400 hover:text-cyan-300">
                  View all →
                </Link>
              </div>
              <div className="space-y-3">
                {tasks.slice(0, 5).map((task) => (
                  <div
                    key={task._id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          task.status === "done"
                            ? "bg-emerald-500"
                            : task.status === "in_progress"
                            ? "bg-cyan-500"
                            : task.status === "blocked"
                            ? "bg-red-500"
                            : "bg-zinc-500"
                        }`}
                      />
                      <span className="text-sm text-zinc-300">{task.title}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{task.status}</span>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <p className="text-center py-8 text-zinc-500">No tasks yet</p>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* System Status */}
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-4">System Status</h2>
              <div className="space-y-3">
                {[
                  { name: "Convex Backend", status: "Operational" },
                  { name: "WebSocket", status: "Connected" },
                  { name: "Runtime", status: "Ready" },
                ].map((service) => (
                  <div key={service.name} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">{service.name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      <span className="text-emerald-400">{service.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Add Agent Modal */}
      <AddAgentModal
        isOpen={showAddAgentModal}
        onClose={() => setShowAddAgentModal(false)}
        onCreated={(id) => {
          setShowAddAgentModal(false);
          setSelectedAgentId(id);
        }}
      />

      {/* Agent Detail Tray */}
      {selectedAgentId && (
        <>
          <div
            className="fixed inset-0 z-[84] bg-black/60 backdrop-blur-[1px]"
            onClick={() => setSelectedAgentId(null)}
            aria-hidden="true"
          />
          <AgentDetailTray agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
        </>
      )}
    </div>
  );
}
