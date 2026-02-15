"use client";

import { useState } from "react";
import Link from "next/link";

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

interface KanbanColumnProps {
  id: string;
  label: string;
  icon: string;
  tasks: Task[];
  color: string;
  onDrop?: (taskId: string, newStatus: string) => void;
}

const priorityConfig: Record<string, { color: string; label: string; icon: string }> = {
  low: { color: "text-slate-400 border-slate-700", label: "Low", icon: "🔽" },
  medium: { color: "text-blue-400 border-blue-500/30", label: "Medium", icon: "⏺️" },
  high: { color: "text-amber-400 border-amber-500/30", label: "High", icon: "🔼" },
  urgent: { color: "text-rose-400 border-rose-500/30", label: "Urgent", icon: "🔴" },
};

export function KanbanColumn({ id, label, icon, tasks, color, onDrop }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId && onDrop) {
      onDrop(taskId, id);
    }
  };

  return (
    <div
      className={`flex flex-col rounded-xl border ${
        isDragOver
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-slate-800 bg-slate-900/30"
      } transition-all duration-200`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={`flex items-center justify-between border-b border-slate-800/50 p-4 ${color}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-slate-200">{label}</h3>
        </div>
        <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-800 px-2 text-xs font-medium text-slate-400">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 space-y-3 p-3 min-h-[200px]">
        {tasks.map((task) => (
          <KanbanTaskCard key={task._id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-slate-800">
            <p className="text-sm text-slate-600">Drop tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanTaskCard({ task }: { task: Task }) {
  const [isDragging, setIsDragging] = useState(false);
  const priority = priorityConfig[task.priority] || priorityConfig.medium;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData("taskId", task._id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <Link
      href={`/tasks/${task._id}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group block rounded-lg border border-slate-800 bg-slate-800/80 p-4 shadow-sm transition-all duration-200 hover:border-emerald-500/30 hover:shadow-md hover:shadow-emerald-500/5 cursor-move ${
        isDragging ? "opacity-50 scale-95" : ""
      }`}
    >
      {/* Priority Badge */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${priority.color}`}
        >
          <span>{priority.icon}</span>
          {priority.label}
        </span>
        <svg
          className="h-4 w-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      </div>

      {/* Title */}
      <h4 className="font-medium text-slate-200 line-clamp-2 mb-2">{task.title}</h4>

      {/* Description */}
      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{task.description}</p>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[10px] text-slate-600">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <div className="flex items-center gap-2">
          {task.assigneeIds && task.assigneeIds.length > 0 ? (
            <div className="flex -space-x-1">
              {task.assigneeIds.slice(0, 3).map((_, i) => (
                <div
                  key={i}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 border border-slate-800"
                >
                  🤖
                </div>
              ))}
              {task.assigneeIds.length > 3 && (
                <span className="text-[10px] text-slate-500">+{task.assigneeIds.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-slate-600">Unassigned</span>
          )}
        </div>
        <span className="text-[10px] text-slate-600">
          {new Date(task.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}

interface TaskFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  priorityFilter: string;
  onPriorityChange: (priority: string) => void;
  tagFilter: string;
  onTagChange: (tag: string) => void;
  allTags?: string[];
}

export function TaskFilters({
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  tagFilter,
  onTagChange,
  allTags = [],
}: TaskFiltersProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
          />
        </div>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityChange(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-300 focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="">All Priorities</option>
          <option value="urgent">🔴 Urgent</option>
          <option value="high">🔼 High</option>
          <option value="medium">⏺️ Medium</option>
          <option value="low">🔽 Low</option>
        </select>

        {/* Tag Filter */}
        <select
          value={tagFilter}
          onChange={(e) => onTagChange(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-300 focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
