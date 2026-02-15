"use client";

import { useState, useMemo } from "react";
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

export default function AgentsPage() {
  const agents = (useQuery(api.agents.list) || []) as Agent[];
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesSearch =
        searchQuery === "" ||
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.role.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "" || agent.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter]);

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === "active").length,
    idle: agents.filter((a) => a.status === "idle").length,
    blocked: agents.filter((a) => a.status === "blocked").length,
  };

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Agents
              </h1>
              <p className="mt-2 text-lg text-zinc-400">Manage your AI agent workforce</p>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </header>

        {/* Stats Bar */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "text-zinc-200" },
            { label: "Active", value: stats.active, color: "text-emerald-300" },
            { label: "Idle", value: stats.idle, color: "text-zinc-300" },
            { label: "Blocked", value: stats.blocked, color: "text-red-300" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-4"
            >
              <p className="text-xs uppercase tracking-wider text-zinc-500">{stat.label}</p>
              <p className={`mt-1 text-3xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </section>

        {/* Filters */}
        <section className="mb-6 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-cyan-400/40 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-cyan-400/40 focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="blocked">Blocked</option>
          </select>
          <button
            onClick={() => setShowAddAgentModal(true)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
          >
            + Deploy New Agent
          </button>
          {(searchQuery || statusFilter) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
              }}
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              Clear filters
            </button>
          )}
        </section>

        {/* Results Info */}
        <div className="mb-4 text-sm text-zinc-500">
          Showing {filteredAgents.length} of {agents.length} agents
        </div>

        {/* Agents Grid */}
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
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

          {/* Add New Agent Button */}
          <button
            type="button"
            onClick={() => setShowAddAgentModal(true)}
            className="group flex min-h-[365px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-gradient-to-br from-white/[0.02] to-white/[0.01] transition-colors hover:border-white/25 hover:from-white/[0.04] hover:to-white/[0.02]"
          >
            <span className="text-sm font-medium tracking-wide text-zinc-400 transition-colors group-hover:text-zinc-200">
              Deploy New Agent
            </span>
          </button>
        </section>

        {filteredAgents.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-12 text-center">
            <p className="text-lg font-medium text-white">No agents found</p>
            <p className="mt-2 text-sm text-zinc-500">Try adjusting your filters</p>
          </div>
        )}
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
