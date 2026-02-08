"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

function levelBadge(role: string) {
  const r = role.toLowerCase();
  if (r.includes("lead")) return "LEAD";
  if (r.includes("monitor") || r.includes("research")) return "SPC";
  return "INT";
}

function statusStyle(status: "idle" | "active" | "blocked") {
  if (status === "active") {
    return "border-emerald-500/40 bg-emerald-500/20 text-emerald-200";
  }
  if (status === "blocked") {
    return "border-red-500/40 bg-red-500/20 text-red-200";
  }
  return "border-zinc-600/60 bg-zinc-700/30 text-zinc-300";
}

export default function AgentsSidebarPanel({
  onSelectAgent,
  className = "",
}: {
  onSelectAgent?: (id: Id<"agents">) => void;
  className?: string;
}) {
  const agentsQuery = useQuery(api.agents.list);
  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);
  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const blockedCount = agents.filter((agent) => agent.status === "blocked").length;

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,21,0.95),rgba(6,9,14,0.95))] ${className}`}
      aria-label="Agent roster"
    >
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Agent Roster</p>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{agents.length} total</span>
          <span>-</span>
          <span className="text-emerald-300">{activeCount} active</span>
          <span>-</span>
          <span className="text-red-300">{blockedCount} blocked</span>
        </div>
      </div>

      <div className="h-[min(68vh,760px)] space-y-2 overflow-y-auto p-3">
        {agentsQuery === undefined && (
          <p className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Connecting to agents...
          </p>
        )}

        {agents.map((agent) => (
          <button
            key={agent._id}
            type="button"
            onClick={() => onSelectAgent?.(agent._id)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{agent.name}</p>
                <p className="truncate text-[11px] uppercase tracking-wider text-zinc-500">{agent.role}</p>
              </div>
              <span className="rounded border border-cyan-300/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                {levelBadge(agent.role)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusStyle(agent.status)}`}
              >
                {agent.status}
              </span>
              <span className="font-mono text-[10px] text-zinc-600">#{agent._id.slice(-4)}</span>
            </div>
          </button>
        ))}

        {agentsQuery !== undefined && agents.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-black/25 px-3 py-4 text-center text-xs text-zinc-500">
            No agents available.
          </p>
        )}
      </div>
    </aside>
  );
}
