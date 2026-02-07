"use client";

import KanbanBoard from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMemo, useState } from "react";

export default function KanbanPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const tasks = useQuery(api.tasks.list) || [];

  const stats = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const review = tasks.filter((t) => t.status === "review").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { total: tasks.length, inProgress, review, done };
  }, [tasks]);

  return (
    <main className="min-h-[calc(100vh-7rem)]">
      <header className="mb-7 border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Mission Board
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Inbox to done pipeline with autonomous specialist handoffs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:flex">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Total</span>
              <span className="font-mono text-sm text-zinc-200">{stats.total}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-xs uppercase tracking-wider text-zinc-500">In Progress</span>
              <span className="font-mono text-sm text-cyan-300">{stats.inProgress}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-xs uppercase tracking-wider text-zinc-500">Review</span>
              <span className="font-mono text-sm text-amber-300">{stats.review}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-xs uppercase tracking-wider text-zinc-500">Done</span>
              <span className="font-mono text-sm text-emerald-300">{stats.done}</span>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20"
            >
              New Task
            </button>
          </div>
        </div>
      </header>

      <KanbanBoard />
      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </main>
  );
}
