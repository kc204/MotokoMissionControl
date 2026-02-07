"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AgentCard from "@/components/AgentCard";

export default function Home() {
  const agents = useQuery(api.agents.list) || [];
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <main className="relative min-h-[calc(100vh-7rem)] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-cyan-500/[0.03]" />
      </div>

      <header className="mb-10 border-b border-white/10 pb-8 pt-2">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Mission Control</h1>
            <p className="mt-3 text-2xl tracking-tight text-zinc-400">OpenClaw Agent Workforce</p>
          </div>
          <div className="min-w-24 text-right">
            <p className="text-5xl font-semibold leading-none">{activeCount}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">Active Agents</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent._id}
            id={agent._id}
            name={agent.name}
            role={agent.role}
            status={agent.status}
            currentTaskId={agent.currentTaskId}
            models={agent.models}
          />
        ))}

        <button className="group flex min-h-[365px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-gradient-to-br from-white/[0.02] to-white/[0.01] transition-colors hover:border-white/25 hover:from-white/[0.04] hover:to-white/[0.02]">
          <span className="text-sm font-medium tracking-wide text-zinc-400 transition-colors group-hover:text-zinc-200">
            Deploy New Agent
          </span>
        </button>
      </section>
    </main>
  );
}
