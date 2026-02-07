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
}

export default function AgentCard({ id, name, role, status, currentTaskId, models }: AgentCardProps) {
  const currentTask = useQuery(api.tasks.get, currentTaskId ? { id: currentTaskId } : "skip");
  const availableModels = useQuery(api.models.list) || [];
  const updateModel = useMutation(api.agents.updateModel);
  const [isEditing, setIsEditing] = useState(false);

  const statusColors = {
    idle: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse",
    blocked: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const handleModelChange = async (newModelId: string) => {
    await updateModel({ id, modelType: "thinking", modelName: newModelId });
    setIsEditing(false);
  };

  // Find readable name for current model
  const currentModelName = availableModels.find(m => m.id === models.thinking)?.name || models.thinking;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/10">
      {/* Glow Effect */}
      <div className={`absolute -right-12 -top-12 h-24 w-24 rounded-full blur-3xl transition-opacity group-hover:opacity-100 ${
        status === 'active' ? 'bg-emerald-500/20' : 'bg-blue-500/10'
      }`} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-mono text-lg font-bold text-white tracking-tight">{name}</h3>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{role}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusColors[status]}`}>
          {status}
        </span>
      </div>

      {/* Models (Connected to OpenClaw Config) */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Brain Model</p>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="text-[10px] text-zinc-500 hover:text-white transition-colors"
          >
            {isEditing ? "Done" : "Change"}
          </button>
        </div>
        
        {isEditing ? (
          <select 
            value={models.thinking}
            onChange={(e) => handleModelChange(e.target.value)}
            className="mt-1 w-full rounded bg-black/40 border border-white/10 text-xs text-zinc-300 p-1 focus:outline-none focus:border-blue-500"
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <p className="mt-1 text-xs text-zinc-300 font-mono bg-black/20 rounded px-2 py-1 inline-block border border-white/5 truncate max-w-full" title={currentModelName}>
            {currentModelName}
          </p>
        )}
      </div>

      {/* Current Task */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Current Task</p>
        <div className="min-h-[3rem] rounded-lg border border-white/5 bg-black/20 p-3">
          {currentTask ? (
            <p className="text-sm text-zinc-300 line-clamp-2">{currentTask.title}</p>
          ) : (
            <p className="text-sm italic text-zinc-600">No active task</p>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-ping' : 'bg-zinc-600'}`} />
          <span className="text-[10px] text-zinc-500 font-mono">
            {status === 'active' ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">ID: {id.slice(-4)}</span>
      </div>
    </div>
  );
}
