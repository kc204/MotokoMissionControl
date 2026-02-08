"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type AgentStatus = "idle" | "active" | "blocked";
type AgentLevel = "LEAD" | "INT" | "SPC";
type SelectedAgent = Id<"agents"> | "new";

type AgentDraft = {
  name: string;
  role: string;
  level: AgentLevel;
  status: AgentStatus;
  avatar: string;
  thinkingModel: string;
  systemPrompt: string;
  character: string;
  lore: string;
};

const DEFAULT_DRAFT: AgentDraft = {
  name: "",
  role: "",
  level: "SPC",
  status: "idle",
  avatar: "",
  thinkingModel: "google-antigravity/claude-opus-4-5-thinking",
  systemPrompt: "",
  character: "",
  lore: "",
};

function draftFromAgent(agent: {
  name: string;
  role: string;
  level?: AgentLevel;
  status: AgentStatus;
  avatar?: string;
  models: { thinking: string };
  systemPrompt?: string;
  character?: string;
  lore?: string;
}): AgentDraft {
  return {
    name: agent.name,
    role: agent.role,
    level: agent.level ?? "SPC",
    status: agent.status,
    avatar: agent.avatar ?? "",
    thinkingModel: agent.models.thinking,
    systemPrompt: agent.systemPrompt ?? "",
    character: agent.character ?? "",
    lore: agent.lore ?? "",
  };
}

export default function AgentStudioPanel() {
  const agentsQuery = useQuery(api.agents.list);
  const modelsQuery = useQuery(api.models.list);
  const createAgent = useMutation(api.agents.createAgent);
  const updateAgent = useMutation(api.agents.updateAgent);
  const updateModel = useMutation(api.agents.updateModel);

  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);
  const models = useMemo(() => modelsQuery ?? [], [modelsQuery]);

  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent>("new");
  const [draft, setDraft] = useState<AgentDraft>(DEFAULT_DRAFT);
  const [statusText, setStatusText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const modelOptions = useMemo(() => {
    if (draft.thinkingModel && !models.some((m) => m.id === draft.thinkingModel)) {
      return [{ id: draft.thinkingModel, name: draft.thinkingModel }, ...models];
    }
    return models;
  }, [draft.thinkingModel, models]);

  useEffect(() => {
    if (selectedAgent === "new") return;
    const current = agents.find((agent) => agent._id === selectedAgent);
    if (!current) return;
    setDraft(draftFromAgent(current));
  }, [selectedAgent, agents]);

  const openNew = () => {
    setSelectedAgent("new");
    setDraft({
      ...DEFAULT_DRAFT,
      thinkingModel: models[0]?.id ?? DEFAULT_DRAFT.thinkingModel,
    });
    setStatusText("");
  };

  const handleSelectAgent = (id: Id<"agents">) => {
    setSelectedAgent(id);
    setStatusText("");
  };

  const save = async () => {
    const name = draft.name.trim();
    const role = draft.role.trim();
    if (!name || !role) {
      setStatusText("Name and role are required.");
      return;
    }

    setIsSaving(true);
    setStatusText("");
    try {
      if (selectedAgent === "new") {
        const createdId = await createAgent({
          name,
          role,
          level: draft.level,
          status: draft.status,
          avatar: draft.avatar.trim() || undefined,
          thinkingModel: draft.thinkingModel,
          systemPrompt: draft.systemPrompt.trim() || undefined,
          character: draft.character.trim() || undefined,
          lore: draft.lore.trim() || undefined,
          sessionIdHint: name,
        });
        setSelectedAgent(createdId);
        setStatusText("Agent created and profile applied.");
      } else {
        const current = agents.find((agent) => agent._id === selectedAgent);
        if (!current) {
          setStatusText("Selected agent not found.");
          return;
        }

        await updateAgent({
          id: selectedAgent,
          name,
          role,
          level: draft.level,
          status: draft.status,
          avatar: draft.avatar.trim() || undefined,
          systemPrompt: draft.systemPrompt.trim() || undefined,
          character: draft.character.trim() || undefined,
          lore: draft.lore.trim() || undefined,
        });

        if (draft.thinkingModel.trim() && draft.thinkingModel !== current.models.thinking) {
          await updateModel({
            id: selectedAgent,
            modelType: "thinking",
            modelName: draft.thinkingModel,
          });
        }
        setStatusText("Agent profile saved and applied.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedAgentRecord =
    selectedAgent === "new"
      ? null
      : agents.find((agent) => agent._id === selectedAgent) ?? null;
  const canSave = draft.name.trim().length > 0 && draft.role.trim().length > 0;

  return (
    <section className="max-w-5xl rounded-2xl border border-white/10 bg-black/35 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Agent Studio</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Edit role, level, persona, and model in one place. Saved profiles apply to the agent on next run.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
        >
          New Agent
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Roster</p>
          <div className="space-y-2">
            {agents.map((agent) => (
              <button
                key={agent._id}
                type="button"
                onClick={() => handleSelectAgent(agent._id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left ${
                  selectedAgent !== "new" && selectedAgent === agent._id
                    ? "border-cyan-300/40 bg-cyan-500/10"
                    : "border-white/10 bg-black/25 hover:bg-white/[0.06]"
                }`}
              >
                <p className="truncate text-sm font-semibold text-zinc-100">{agent.name}</p>
                <p className="truncate text-[11px] uppercase tracking-wider text-zinc-500">{agent.role}</p>
              </button>
            ))}
            {agents.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 px-2.5 py-3 text-xs text-zinc-500">
                No agents yet.
              </p>
            )}
          </div>
        </aside>

        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                placeholder="Agent name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Role</span>
              <input
                value={draft.role}
                onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                placeholder="Agent role"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Level</span>
              <select
                value={draft.level}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, level: e.target.value as AgentLevel }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="LEAD">LEAD</option>
                <option value="INT">INT</option>
                <option value="SPC">SPC</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</span>
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, status: e.target.value as AgentStatus }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="idle">Idle</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Thinking Model</span>
              <select
                value={draft.thinkingModel}
                onChange={(e) => setDraft((prev) => ({ ...prev, thinkingModel: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              >
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              {models.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-300/80">No runtime models found yet. Start watcher and retry.</p>
              ) : null}
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Avatar URL (Optional)</span>
            <input
              value={draft.avatar}
              onChange={(e) => setDraft((prev) => ({ ...prev, avatar: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              placeholder="https://..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">System Prompt</span>
            <textarea
              value={draft.systemPrompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              placeholder="Core operating instructions..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Character</span>
            <textarea
              value={draft.character}
              onChange={(e) => setDraft((prev) => ({ ...prev, character: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              placeholder="Tone, style, and personality..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Lore</span>
            <textarea
              value={draft.lore}
              onChange={(e) => setDraft((prev) => ({ ...prev, lore: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              placeholder="Backstory and domain context..."
            />
          </label>

          {selectedAgentRecord && (
            <p className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-500">
              Session Key: <span className="font-mono">{selectedAgentRecord.sessionKey}</span>
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave || isSaving}
              onClick={save}
              className="rounded-lg border border-emerald-300/35 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-50"
            >
              {isSaving
                ? "Saving..."
                : selectedAgent === "new"
                ? "Create Agent"
                : "Save Agent Profile"}
            </button>
            <span className="text-xs text-zinc-400">{statusText}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
