"use client";

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export default function NewTaskModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createTask = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask({
      title,
      description,
      priority,
      status: "inbox",
      createdBy: "User",
    });
    onClose();
    setTitle("");
    setDescription("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold text-white mb-4">Create New Task</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-blue-500 outline-none"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-blue-500 outline-none h-24"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high" | "urgent")}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-blue-500 outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-bold bg-white text-black rounded-xl hover:bg-zinc-200"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
