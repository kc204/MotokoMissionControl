"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function AgentDetailTray({
  agentId,
  onClose,
}: {
  agentId: Id<"agents"> | null;
  onClose: () => void;
}) {
  const agent = useQuery(api.agents.get, agentId ? { id: agentId } : "skip");
  const updateAgent = useMutation(api.agents.updateAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [avatar, setAvatar] = useState("");
  const [status, setStatus] = useState<"idle" | "active" | "blocked">("idle");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setRole(agent.role);
    setAvatar(agent.avatar || "");
    setStatus(agent.status);
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
        avatar: avatar.trim() || undefined,
        status,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${agent.name}?`)) return;
    await deleteAgent({ id: agent._id });
    onClose();
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-[85] w-full max-w-md border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Agent Details</h3>
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
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Name</span>
            <input
              disabled={!isEditing}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Role</span>
            <input
              disabled={!isEditing}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Avatar URL</span>
            <input
              disabled={!isEditing}
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</span>
            <select
              disabled={!isEditing}
              value={status}
              onChange={(e) => setStatus(e.target.value as "idle" | "active" | "blocked")}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
            >
              <option value="idle">Idle</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
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
