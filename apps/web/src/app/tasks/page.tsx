"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@motoko/db";
import AddTaskModal from "@/components/AddTaskModal";

interface Task {
  _id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags?: string[];
  assigneeIds?: string[];
  createdAt: number;
}

const columns = [
  { id: "inbox", label: "Inbox", color: "from-zinc-500/20 to-zinc-500/0" },
  { id: "assigned", label: "Assigned", color: "from-indigo-500/20 to-indigo-500/0" },
  { id: "in_progress", label: "In Progress", color: "from-cyan-500/20 to-cyan-500/0" },
  { id: "testing", label: "Testing", color: "from-fuchsia-500/20 to-fuchsia-500/0" },
  { id: "review", label: "Review", color: "from-amber-500/20 to-amber-500/0" },
  { id: "done", label: "Done", color: "from-emerald-500/20 to-emerald-500/0" },
];

const priorityClass = (priority: string) => {
  if (priority === "urgent") return "border-red-500/40 bg-red-500/15 text-red-200";
  if (priority === "high") return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  if (priority === "medium") return "border-blue-500/40 bg-blue-500/15 text-blue-200";
  return "border-zinc-500/40 bg-zinc-500/15 text-zinc-300";
};

const timeAgo = (ts: number) => {
  const delta = Date.now() - ts;
  const m = Math.floor(delta / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export default function TasksPage() {
  const tasks = (useQuery(api.tasks.list, { limit: 200 }) || []) as Task[];
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tasks.forEach((task) => task.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        searchQuery === "" ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "" || task.priority === priorityFilter;
      const matchesTag = tagFilter === "" || (task.tags?.includes(tagFilter) ?? false);
      return matchesSearch && matchesPriority && matchesTag;
    });
  }, [tasks, searchQuery, priorityFilter, tagFilter]);

  // Group by status
  const tasksByStatus = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = filteredTasks.filter((task) => task.status === col.id);
      return acc;
    }, {} as Record<string, Task[]>);
  }, [filteredTasks]);

  // Stats
  const stats = {
    total: tasks.length,
    urgent: tasks.filter((t) => t.priority === "urgent").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-7 border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Mission Board
              </h1>
              <p className="mt-2 text-sm text-zinc-400">Inbox to done pipeline with autonomous specialist handoffs.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:flex">
                <span className="text-xs uppercase tracking-wider text-zinc-500">Total</span>
                <span className="font-mono text-sm text-zinc-200">{stats.total}</span>
                <span className="text-zinc-700">|</span>
                <span className="text-xs uppercase tracking-wider text-zinc-500">In Progress</span>
                <span className="font-mono text-sm text-cyan-300">{stats.inProgress}</span>
                <span className="text-zinc-700">|</span>
                <span className="text-xs uppercase tracking-wider text-zinc-500">Done</span>
                <span className="font-mono text-sm text-emerald-300">{stats.done}</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAddTaskModal(true)}
                className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20"
              >
                New Task
              </button>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="mb-6 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-cyan-400/40 focus:outline-none"
          />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-cyan-400/40 focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-cyan-400/40 focus:outline-none"
            >
              <option value="">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}
          {(searchQuery || priorityFilter || tagFilter) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setPriorityFilter("");
                setTagFilter("");
              }}
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              Clear filters
            </button>
          )}
        </section>

        {/* Results Info */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </p>
        </div>

        {/* Kanban Board */}
        <section className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-5">
            {columns.map((column) => {
              const columnTasks = tasksByStatus[column.id] || [];
              return (
                <div key={column.id} className="w-[310px]">
                  <header className="mb-2 flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      {column.label}
                    </h3>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-zinc-400">
                      {columnTasks.length}
                    </span>
                  </header>

                  <div
                    className={`relative min-h-[50vh] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b ${column.color} p-3`}
                  >
                    {columnTasks.length === 0 && (
                      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20">
                        <p className="text-xs uppercase tracking-wider text-zinc-600">No tasks</p>
                      </div>
                    )}
                    {columnTasks.map((task) => (
                      <div
                        key={task._id}
                        className="mb-3 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3.5 transition-colors hover:border-white/20"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityClass(
                              task.priority
                            )}`}
                          >
                            {task.priority}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-600">#{task._id.slice(-4)}</span>
                        </div>

                        <h4 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                          {task.title}
                        </h4>
                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                          {task.description || "No description"}
                        </p>

                        {task.tags && task.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {task.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span>{task.assigneeIds?.length ? "Assigned" : "Unassigned"}</span>
                          <span>{timeAgo(task.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Priority Legend */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Priority Levels</h3>
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Urgent", desc: "Critical tasks requiring immediate attention", color: "text-red-400" },
              { label: "High", desc: "Important tasks with tight deadlines", color: "text-amber-400" },
              { label: "Medium", desc: "Standard priority tasks", color: "text-blue-400" },
              { label: "Low", desc: "Nice-to-have tasks, no urgency", color: "text-zinc-400" },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div>
                  <p className={`font-medium ${p.color}`}>{p.label}</p>
                  <p className="text-xs text-zinc-500">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AddTaskModal isOpen={showAddTaskModal} onClose={() => setShowAddTaskModal(false)} />
    </div>
  );
}
