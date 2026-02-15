"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";

interface AgentDetailTrayProps {
  agentId: Id<"agents"> | null;
  onClose: () => void;
}

export default function AgentDetailTray({ agentId, onClose }: AgentDetailTrayProps) {
  const agent = useQuery(api.agents.get, agentId ? { id: agentId } : "skip");
  const updateAgent = useMutation(api.agents.update);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState<"LEAD" | "INT" | "SPC">("SPC");
  const [avatar, setAvatar] = useState("");
  const [status, setStatus] = useState<"idle" | "active" | "blocked">("idle");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [character, setCharacter] = useState("");
  const [lore, setLore] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setRole(agent.role);
    setLevel((agent.level as "LEAD" | "INT" | "SPC") ?? "SPC");
    setAvatar(agent.avatar || "");
    setStatus(agent.status);
    setSystemPrompt(agent.systemPrompt || "");
    setCharacter(agent.character || "");
    setLore(agent.lore || "");
    setIsEditing(false);
  }, [agent]);

  if (!agentId || !agent) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateAgent({
        id: agent._id,
        name: name.trim(),
        role: role.trim(),
        level,
        avatar: avatar.trim() || undefined,
        status,
        systemPrompt: systemPrompt.trim() || undefined,
        character: character.trim() || undefined,
        lore: lore.trim() || undefined,
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update agent:", err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setName(agent.name);
    setRole(agent.role);
    setLevel((agent.level as "LEAD" | "INT" | "SPC") ?? "SPC");
    setAvatar(agent.avatar || "");
    setStatus(agent.status);
    setSystemPrompt(agent.systemPrompt || "");
    setCharacter(agent.character || "");
    setLore(agent.lore || "");
    setIsEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Delete ${agent.name}? This cannot be undone.`)) return;
    try {
      await deleteAgent({ id: agent._id });
      onClose();
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-[85] w-full max-w-md border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Agent Details
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Session Key</p>
            <p className="mt-1 font-mono text-xs text-zinc-300">{agent.sessionKey}</p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Name
            </span>
            <input
              disabled={!isEditing}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Role
            </span>
            <input
              disabled={!isEditing}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Level
            </span>
            <select
              disabled={!isEditing}
              value={level}
              onChange={(e) => setLevel(e.target.value as "LEAD" | "INT" | "SPC")}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            >
              <option value="LEAD">LEAD</option>
              <option value="INT">INT</option>
              <option value="SPC">SPC</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Avatar URL
            </span>
            <input
              disabled={!isEditing}
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Status
            </span>
            <select
              disabled={!isEditing}
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "idle" | "active" | "blocked")
              }
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            >
              <option value="idle">Idle</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              System Prompt
            </span>
            <textarea
              disabled={!isEditing}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Character
            </span>
            <textarea
              disabled={!isEditing}
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Lore
            </span>
            <textarea
              disabled={!isEditing}
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={remove}
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
