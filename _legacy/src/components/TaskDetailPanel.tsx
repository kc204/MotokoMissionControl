"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const statusOptions: Array<{ value: "inbox" | "assigned" | "in_progress" | "testing" | "review" | "done" | "blocked" | "archived"; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "testing", label: "Testing" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
  { value: "archived", label: "Archived" },
];

const priorityOptions: Array<{ value: "low" | "medium" | "high" | "urgent"; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const docTypes: Array<{ value: "deliverable" | "research" | "spec" | "note" | "markdown"; label: string }> = [
  { value: "deliverable", label: "Deliverable" },
  { value: "research", label: "Research" },
  { value: "spec", label: "Spec" },
  { value: "note", label: "Note" },
  { value: "markdown", label: "Markdown" },
];

const colorSwatches = [
  { value: "", label: "Default" },
  { value: "#22c55e", label: "Green" },
  { value: "#38bdf8", label: "Cyan" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#a78bfa", label: "Violet" },
];

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

export default function TaskDetailPanel({
  taskId,
  onClose,
  onPreviewDocument,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
  onPreviewDocument?: (id: Id<"documents">) => void;
}) {
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : "skip");
  const agentsQuery = useQuery(api.agents.list);
  const docsQuery = useQuery(api.documents.byTask, taskId ? { taskId } : "skip");
  const messagesQuery = useQuery(api.messages.list, taskId ? { channel: `task:${taskId}` } : "skip");
  const activitiesQuery = useQuery(api.activities.forTask, taskId ? { taskId, limit: 40 } : "skip");
  const dispatchState = useQuery(api.tasks.getDispatchState, taskId ? { taskId } : "skip");

  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);
  const docs = useMemo(() => docsQuery ?? [], [docsQuery]);
  const messages = useMemo(() => messagesQuery ?? [], [messagesQuery]);
  const activities = useMemo(() => activitiesQuery ?? [], [activitiesQuery]);

  const updateStatus = useMutation(api.tasks.updateStatus);
  const archiveTask = useMutation(api.tasks.archive);
  const stopDispatch = useMutation(api.tasks.stopDispatch);
  const updateDetails = useMutation(api.tasks.updateDetails);
  const assignTask = useMutation(api.tasks.assign);
  const enqueueDispatch = useMutation(api.tasks.enqueueDispatch);
  const sendMessage = useMutation(api.messages.send);
  const createDocument = useMutation(api.documents.create);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [status, setStatus] = useState<"inbox" | "assigned" | "in_progress" | "testing" | "review" | "done" | "blocked" | "archived">("inbox");
  const [assignees, setAssignees] = useState<Id<"agents">[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [borderColor, setBorderColor] = useState<string>("");
  const [comment, setComment] = useState("");
  const [dispatchPrompt, setDispatchPrompt] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [isStoppingDispatch, setIsStoppingDispatch] = useState(false);

  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docType, setDocType] = useState<"deliverable" | "research" | "spec" | "note" | "markdown">("note");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setStatus(task.status);
    setAssignees(task.assigneeIds);
    setTags(task.tags ?? []);
    setBorderColor(task.borderColor ?? "");
  }, [task]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages]
  );

  if (!taskId || !task) return null;

  const saveDetails = async () => {
    setIsSaving(true);
    try {
      await updateDetails({
        id: task._id,
        title: title.trim(),
        description: description.trim(),
        priority,
        tags,
        borderColor: borderColor || undefined,
      });

      if (status !== task.status) {
        await updateStatus({ id: task._id, status });
      }

      const sameAssignees =
        assignees.length === task.assigneeIds.length &&
        assignees.every((id) => task.assigneeIds.includes(id));
      if (!sameAssignees) {
        await assignTask({
          id: task._id,
          assigneeIds: assignees,
          assignedBy: "Mission Control",
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const sendTaskComment = async () => {
    const text = comment.trim();
    if (!text) return;
    await sendMessage({
      channel: `task:${task._id}`,
      taskId: task._id,
      text,
      fromUser: true,
    });
    setComment("");
  };

  const addResource = async () => {
    const trimmedTitle = docTitle.trim();
    if (!trimmedTitle) return;
    await createDocument({
      title: trimmedTitle,
      content: docContent.trim(),
      type: docType,
      taskId: task._id,
      createdBy: "Mission Control",
    });
    setDocTitle("");
    setDocContent("");
    setDocType("note");
  };

  const toggleAssignee = (id: Id<"agents">) => {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

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

  const requestDispatch = async () => {
    setIsDispatching(true);
    try {
      await enqueueDispatch({
        taskId: task._id,
        requestedBy: "Mission Control",
        prompt: dispatchPrompt.trim() || undefined,
      });
      setDispatchPrompt("");
      if (status !== "in_progress") setStatus("in_progress");
    } finally {
      setIsDispatching(false);
    }
  };

  const stopCurrentDispatch = async () => {
    setIsStoppingDispatch(true);
    try {
      await stopDispatch({
        taskId: task._id,
        reason: "Stopped from task detail panel",
      });
    } finally {
      setIsStoppingDispatch(false);
    }
  };

  const archiveCurrentTask = async () => {
    await archiveTask({ id: task._id });
    onClose();
  };

  const dispatchStateLabel =
    dispatchState?.status === "running"
      ? "Running"
      : dispatchState?.status === "pending"
      ? "Queued"
      : "Idle";

  return (
    <aside className="fixed inset-y-0 right-0 z-[90] w-full max-w-xl border-l border-white/10 bg-[linear-gradient(180deg,rgba(9,13,21,0.98),rgba(6,9,14,0.98))] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Task</p>
            <p className="font-mono text-xs text-zinc-300">{task._id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              >
                {priorityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-28 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Tags</span>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="research, ui, backend"
                  className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
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
            </label>

            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Card Accent</span>
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
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Assignees</p>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => {
                const selected = assignees.includes(agent._id);
                return (
                  <button
                    key={agent._id}
                    type="button"
                    onClick={() => toggleAssignee(agent._id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      selected
                        ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-200"
                        : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
                    }`}
                  >
                    {agent.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Resources</p>
              <span className="text-xs text-zinc-500">{docs.length}</span>
            </div>
            <div className="space-y-2">
              {docs.map((doc) => (
                <button
                  key={doc._id}
                  type="button"
                  onClick={() => onPreviewDocument?.(doc._id)}
                  className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-left hover:bg-white/[0.06]"
                >
                  <p className="text-sm text-zinc-200">{doc.title}</p>
                  <p className="text-xs text-zinc-500">{doc.type}</p>
                </button>
              ))}
              {docs.length === 0 && <p className="text-xs text-zinc-500">No resources yet.</p>}
            </div>

            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="New resource title"
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              />
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Resource content"
                  className="h-20 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                />
                <div className="space-y-2">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as typeof docType)}
                    className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                  >
                    {docTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addResource}
                    className="w-full rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent Dispatch</p>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
                {dispatchStateLabel}
              </span>
            </div>
            <textarea
              value={dispatchPrompt}
              onChange={(e) => setDispatchPrompt(e.target.value)}
              placeholder="Optional instruction for this run..."
              className="h-16 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
            />
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={requestDispatch}
                  disabled={
                    isDispatching ||
                    isStoppingDispatch ||
                    dispatchState?.status === "pending" ||
                    dispatchState?.status === "running"
                  }
                  className="rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
                >
                  {dispatchState?.status === "running"
                    ? "Running..."
                    : dispatchState?.status === "pending"
                    ? "Queued..."
                    : isDispatching
                    ? "Queueing..."
                    : "Run / Resume Task"}
                </button>
                {(dispatchState?.status === "pending" || dispatchState?.status === "running") && (
                  <button
                    type="button"
                    onClick={stopCurrentDispatch}
                    disabled={isStoppingDispatch}
                    className="rounded-lg border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-60"
                  >
                    {isStoppingDispatch ? "Stopping..." : "Stop Run"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Comments</p>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {sortedMessages.map((msg) => (
                <div key={msg._id} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{msg.agent?.name || (msg.fromUser ? "HQ" : "System")}</span>
                    <span>{timeAgo(msg.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-200">{msg.text || msg.content}</p>
                </div>
              ))}
              {sortedMessages.length === 0 && <p className="text-xs text-zinc-500">No comments yet.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                className="h-16 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
              />
              <button
                type="button"
                onClick={sendTaskComment}
                className="self-end rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/25"
              >
                Send
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Activity</p>
            <div className="space-y-2">
              {activities.map((item) => (
                <div key={item._id} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <p className="text-sm text-zinc-200">{item.message}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{timeAgo(item.createdAt)}</p>
                </div>
              ))}
              {activities.length === 0 && <p className="text-xs text-zinc-500">No activity yet.</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
            >
              Cancel
            </button>
            {task.status !== "archived" && (
              <button
                type="button"
                onClick={archiveCurrentTask}
                className="rounded-lg border border-amber-300/30 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
              >
                Archive
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={saveDetails}
            disabled={isSaving}
            className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </aside>
  );
}
