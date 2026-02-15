"use client";

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export default function NewTaskModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const createTask = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [borderColor, setBorderColor] = useState<string>("");

  const colorSwatches = [
    { value: "", label: "Default" },
    { value: "#22c55e", label: "Green" },
    { value: "#38bdf8", label: "Cyan" },
    { value: "#f59e0b", label: "Amber" },
    { value: "#ef4444", label: "Red" },
    { value: "#a78bfa", label: "Violet" },
  ];

  const addTag = () => {
    const next = tagInput.trim().replace(/,+$/g, "");
    if (!next) return;
    if (tags.includes(next)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, next]);
    setTagInput("");
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask({
      title,
      description,
      priority,
      status: "inbox",
      createdBy: "User",
      tags,
      borderColor: borderColor || undefined,
    });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTags([]);
    setTagInput("");
    setBorderColor("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] p-6 shadow-2xl">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Create New Task</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Add a mission card to the board. Unassigned tasks route to the squad lead.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-28 w-full resize-none rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
              placeholder="Context, expected output, and constraints..."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high" | "urgent")}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Tags
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                placeholder="research, ui, backend"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300"
                  >
                    {tag} x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Card Accent
            </label>
            <div className="flex flex-wrap gap-2">
              {colorSwatches.map((swatch) => (
                <button
                  key={swatch.label}
                  type="button"
                  onClick={() => setBorderColor(swatch.value)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                    borderColor === swatch.value
                      ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-200"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ backgroundColor: swatch.value || "#71717a" }}
                  />
                  {swatch.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
