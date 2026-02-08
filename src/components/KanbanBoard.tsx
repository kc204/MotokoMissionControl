"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";

const BASE_COLUMNS = ["inbox", "assigned", "in_progress", "review", "done"] as const;
const ARCHIVE_COLUMN = "archived" as const;
type ColumnStatus = (typeof BASE_COLUMNS)[number] | typeof ARCHIVE_COLUMN;
type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | "archived";

const LABELS: Record<ColumnStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  archived: "Archived",
};

const columnAccent: Record<ColumnStatus, string> = {
  inbox: "from-zinc-500/20 to-zinc-500/0",
  assigned: "from-indigo-500/20 to-indigo-500/0",
  in_progress: "from-cyan-500/20 to-cyan-500/0",
  review: "from-amber-500/20 to-amber-500/0",
  done: "from-emerald-500/20 to-emerald-500/0",
  archived: "from-zinc-700/25 to-zinc-700/0",
};

interface Task {
  _id: Id<"tasks">;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  assigneeIds: Id<"agents">[];
  updatedAt: number;
  tags?: string[];
  borderColor?: string;
}

type DispatchStateByTask = Record<string, "pending" | "running">;

function priorityClass(priority: Task["priority"]) {
  if (priority === "urgent") return "border-red-500/40 bg-red-500/15 text-red-200";
  if (priority === "high") return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  if (priority === "medium") return "border-blue-500/40 bg-blue-500/15 text-blue-200";
  return "border-zinc-500/40 bg-zinc-500/15 text-zinc-300";
}

function timeAgo(ts: number) {
  const delta = Date.now() - ts;
  const m = Math.floor(delta / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function TaskCard({
  task,
  assigneeName,
  selected,
  dispatchState,
  onSelect,
  onRun,
  onArchive,
}: {
  task: Task;
  assigneeName: string;
  selected: boolean;
  dispatchState?: "pending" | "running";
  onSelect?: (id: Id<"tasks">) => void;
  onRun?: (id: Id<"tasks">) => void;
  onArchive?: (id: Id<"tasks">) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task._id,
    data: { ...task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: task.borderColor || undefined,
    borderLeftWidth: task.borderColor ? "3px" : undefined,
  };

  const canRun = task.status !== "archived";
  const runLabel =
    dispatchState === "running" ? "Running..." : dispatchState === "pending" ? "Queued..." : "Run";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`mb-3 cursor-grab rounded-xl border bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3.5 transition-colors active:cursor-grabbing ${
        selected
          ? "border-cyan-300/40 ring-1 ring-cyan-300/35"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityClass(task.priority)}`}
        >
          {task.priority}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">#{task._id.slice(-4)}</span>
      </div>

      <h4 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">{task.title}</h4>
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
        <span className="truncate">{assigneeName}</span>
        <span>{timeAgo(task.updatedAt)}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {onSelect && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(task._id);
            }}
            className="rounded-lg border border-cyan-300/30 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            Open
          </button>
        )}
        {canRun && onRun && (
          <button
            type="button"
            disabled={dispatchState === "pending" || dispatchState === "running"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRun(task._id);
            }}
            className="rounded-lg border border-emerald-300/30 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {runLabel}
          </button>
        )}
        {task.status === "done" && onArchive && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onArchive(task._id);
            }}
            className="rounded-lg border border-amber-300/30 bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  onSelectTask,
  selectedTaskId,
}: {
  onSelectTask?: (id: Id<"tasks">) => void;
  selectedTaskId?: Id<"tasks"> | null;
}) {
  const tasksQuery = useQuery(api.tasks.list);
  const agentsQuery = useQuery(api.agents.list);
  const dispatchStatesQuery = useQuery(api.tasks.listDispatchStates);
  const tasks = useMemo(() => tasksQuery ?? [], [tasksQuery]);
  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);
  const dispatchStateByTask = useMemo(() => {
    const rows = dispatchStatesQuery ?? [];
    return rows.reduce<DispatchStateByTask>((acc, row) => {
      acc[row.taskId] = row.status;
      return acc;
    }, {});
  }, [dispatchStatesQuery]);

  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent._id, agent.name])),
    [agents]
  );
  const updateStatus = useMutation(api.tasks.updateStatus);
  const archiveTask = useMutation(api.tasks.archive);
  const enqueueDispatch = useMutation(api.tasks.enqueueDispatch);
  const [activeId, setActiveId] = useState<Id<"tasks"> | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeTask = useMemo(() => tasks.find((t) => t._id === activeId), [activeId, tasks]);
  const archivedCount = tasks.filter((task) => task.status === "archived").length;
  const columns: ColumnStatus[] = showArchived
    ? [...BASE_COLUMNS, ARCHIVE_COLUMN]
    : [...BASE_COLUMNS];

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as Id<"tasks">);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    if (columns.includes(over.id as ColumnStatus)) {
      const newStatus = over.id as TaskStatus;
      const taskId = active.id as Id<"tasks">;
      await updateStatus({ id: taskId, status: newStatus });
    }
  };

  const requestDispatch = async (taskId: Id<"tasks">) => {
    await enqueueDispatch({
      taskId,
      requestedBy: "Mission Board",
    });
  };

  const archiveFromBoard = async (taskId: Id<"tasks">) => {
    await archiveTask({ id: taskId });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-5 pb-4">
          {columns.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="w-[310px]">
                <header className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    {LABELS[status]}
                  </h3>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-zinc-400">
                    {columnTasks.length}
                  </span>
                </header>

                <SortableContext
                  id={status}
                  items={columnTasks.map((t) => t._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    id={status}
                    className={`relative min-h-[62vh] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b p-3 ${columnAccent[status]}`}
                  >
                    {columnTasks.length === 0 && (
                      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20">
                        <p className="text-xs uppercase tracking-wider text-zinc-600">Drop Tasks Here</p>
                      </div>
                    )}
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        assigneeName={
                          task.assigneeIds[0]
                            ? (agentNameById.get(task.assigneeIds[0]) ?? "Assigned")
                            : "Unassigned"
                        }
                        selected={selectedTaskId === task._id}
                        dispatchState={dispatchStateByTask[task._id]}
                        onSelect={onSelectTask}
                        onRun={requestDispatch}
                        onArchive={archiveFromBoard}
                      />
                    ))}
                  </div>
                </SortableContext>
              </section>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">
          Run/resume queues OpenClaw dispatch
        </p>
        <button
          type="button"
          onClick={() => setShowArchived((prev) => !prev)}
          className={`rounded-lg border px-2.5 py-1 text-xs ${
            showArchived
              ? "border-cyan-300/35 bg-cyan-500/15 text-cyan-200"
              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
          }`}
        >
          {showArchived ? "Hide Archived" : "Show Archived"} {archivedCount > 0 ? `(${archivedCount})` : ""}
        </button>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-[310px] rounded-xl border border-cyan-400/35 bg-black/85 p-3.5 shadow-2xl backdrop-blur-xl">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityClass(
                activeTask.priority
              )}`}
            >
              {activeTask.priority}
            </span>
            <h4 className="mt-2 text-sm font-semibold text-zinc-100">{activeTask.title}</h4>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
