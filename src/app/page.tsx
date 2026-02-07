"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AgentCard from "@/components/AgentCard";

export default function Home() {
  const agents = useQuery(api.agents.list) || [];

  return (
    <main className="min-h-screen bg-black text-white selection:bg-blue-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-emerald-600/10 blur-[128px]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-16 flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
              Mission Control
            </h1>
            <p className="mt-2 text-zinc-400">OpenClaw Agent Workforce</p>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col items-end">
              <span className="text-2xl font-mono font-bold text-white">{agents.length}</span>
              <span className="text-xs uppercase tracking-wider text-zinc-500">Active Agents</span>
            </div>
          </div>
        </header>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          
          {/* Add Agent Button Placeholder */}
          <button className="group flex h-full min-h-[280px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-transparent transition-all hover:border-white/20 hover:bg-white/5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 transition-transform group-hover:scale-110">
              <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-zinc-400">Deploy New Agent</p>
          </button>
        </div>
      </div>
    </main>
  );
}
