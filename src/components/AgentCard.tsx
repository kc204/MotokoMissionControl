"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";

interface AgentCardProps {
  id: Id<"agents">;
  name: string;
  role: string;
  status: "idle" | "active" | "blocked";
  currentTaskId?: Id<"tasks">;
  models: {
    thinking: string;
    execution?: string;
    heartbeat: string;
    fallback: string;
  };
  onOpenDetails?: (id: Id<"agents">) => void;
}

const statusStyles = {
  idle: "border-zinc-600/60 bg-zinc-700/30 text-zinc-300",
  active: "border-emerald-500/40 bg-emerald-500/20 text-emerald-300",
  blocked: "border-red-500/40 bg-red-500/20 text-red-300",
} as const;

export default function AgentCard({
  id,
  name,
  role,
  status,
  currentTaskId,
  models,
  onOpenDetails,
}: AgentCardProps) {
  const currentTask = useQuery(api.tasks.get, currentTaskId ? { id: currentTaskId } : "skip");
  const availableModels = useQuery(api.models.list) || [];
  const updateModel = useMutation(api.agents.updateModel);
  const [isEditing, setIsEditing] = useState(false);

  const currentModelName =
    availableModels.find((m) => m.id === models.thinking)?.name || models.thinking;

  const handleModelChange = async (newModelId: string) => {
    await updateModel({ id, modelType: "thinking", modelName: newModelId });
    setIsEditing(false);
  };

  return (
    <article className="group relative min-h-[365px] overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(27,43,72,0.45),transparent_52%),linear-gradient(180deg,rgba(7,12,22,0.94),rgba(4,8,14,0.94))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div
        className={`pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full blur-3xl transition-opacity ${
          status === "active" ? "bg-emerald-500/20 opacity-90" : "bg-cyan-500/10 opacity-70"
        }`}
      />

      <header className="relative flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[2rem] font-semibold leading-none tracking-tight text-zinc-100">{name}</h3>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.1em] text-zinc-400">{role}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider ${statusStyles[status]}`}
        >
          {status}
        </span>
      </header>

      <section className="relative mt-7 space-y-7">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Brain Model</p>
            <button
              onClick={() => setIsEditing((s) => !s)}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              {isEditing ? "Done" : "Change"}
            </button>
          </div>
          {isEditing ? (
            <select
              value={models.thinking}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-zinc-200 focus:border-cyan-400/40 focus:outline-none"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <p
              title={currentModelName}
              className="truncate rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-[0.98rem] text-zinc-200"
            >
              {currentModelName}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Current Task</p>
          <div className="min-h-[78px] rounded-xl border border-white/10 bg-black/35 px-4 py-3">
            {currentTask ? (
              <p className="line-clamp-2 text-base text-zinc-200">{currentTask.title}</p>
            ) : (
              <p className="text-2xl italic tracking-tight text-zinc-500">No active task</p>
            )}
          </div>
        </div>
      </section>

      <footer className="absolute inset-x-6 bottom-6 flex items-center justify-between border-t border-white/10 pt-4">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-emerald-400" : "bg-zinc-600"}`} />
          {status === "active" ? "Online" : "Offline"}
        </p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-zinc-600">ID: {id.slice(-4)}</p>
          {onOpenDetails && (
            <button
              type="button"
              onClick={() => onOpenDetails(id)}
              className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
            >
              Details
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
