"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function AddAgentModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: Id<"agents">) => void;
}) {
  const createAgent = useMutation(api.agents.createAgent);
  const modelsQuery = useQuery(api.models.list);
  const models = useMemo(() => modelsQuery ?? [], [modelsQuery]);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState<"LEAD" | "INT" | "SPC">("SPC");
  const [avatar, setAvatar] = useState("");
  const [status, setStatus] = useState<"idle" | "active" | "blocked">("idle");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [character, setCharacter] = useState("");
  const [lore, setLore] = useState("");
  const [thinkingModel, setThinkingModel] = useState("kimi-coding/kimi-for-coding");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const modelOptions = useMemo(() => {
    if (thinkingModel && !models.some((m) => m.id === thinkingModel)) {
      return [{ id: thinkingModel, name: thinkingModel }, ...models];
    }
    return models;
  }, [models, thinkingModel]);

  useEffect(() => {
    if (models.length === 0) return;
    if (!thinkingModel || !models.some((m) => m.id === thinkingModel)) {
      setThinkingModel(models[0].id);
    }
  }, [models, thinkingModel]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;
    if (models.length === 0) {
      setError("No runtime models available yet. Start watcher and retry.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const agentId = await createAgent({
        name: name.trim(),
        role: role.trim(),
        level,
        avatar: avatar.trim() || undefined,
        status,
        systemPrompt: systemPrompt.trim() || undefined,
        character: character.trim() || undefined,
        lore: lore.trim() || undefined,
        sessionIdHint: name.trim(),
        thinkingModel,
      });
      setName("");
      setRole("");
      setLevel("SPC");
      setAvatar("");
      setStatus("idle");
      setSystemPrompt("");
      setCharacter("");
      setLore("");
      onCreated?.(agentId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Deploy New Agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                placeholder="e.g. Atlas"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Role</span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                placeholder="e.g. QA Engineer"
                required
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Level</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as "LEAD" | "INT" | "SPC")}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              >
                <option value="LEAD">LEAD</option>
                <option value="INT">INT</option>
                <option value="SPC">SPC</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Avatar URL (Optional)</span>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                placeholder="https://..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Initial Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "idle" | "active" | "blocked")}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              >
                <option value="idle">Idle</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">System Prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              placeholder="Core operating instructions for this agent..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Character</span>
            <textarea
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              placeholder="Personality, tone, and communication style..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Lore</span>
            <textarea
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              placeholder="Backstory and domain expertise context..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Thinking Model</span>
            <select
              value={thinkingModel}
              onChange={(e) => setThinkingModel(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
            >
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {models.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-300/80">No runtime models found yet. Start watcher and retry.</p>
            ) : null}
          </label>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || models.length === 0}
              className="rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
            >
              {submitting ? "Deploying..." : "Deploy Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
