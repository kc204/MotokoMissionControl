"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

function typeAccent(type: "deliverable" | "research" | "spec" | "note") {
  if (type === "deliverable") return "border-emerald-300/30 bg-emerald-500/15 text-emerald-200";
  if (type === "research") return "border-cyan-300/30 bg-cyan-500/15 text-cyan-200";
  if (type === "spec") return "border-amber-300/30 bg-amber-500/15 text-amber-200";
  return "border-zinc-300/20 bg-zinc-500/15 text-zinc-200";
}

export default function DocumentPreviewTray({
  documentId,
  onClose,
  withConversationOpen,
}: {
  documentId: Id<"documents">;
  onClose: () => void;
  withConversationOpen: boolean;
}) {
  const document = useQuery(api.documents.get, { id: documentId });
  const task = useQuery(api.tasks.get, document?.taskId ? { id: document.taskId } : "skip");

  if (!document) {
    return (
      <aside className="fixed inset-y-0 right-0 z-[96] w-full max-w-lg border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl md:right-[min(100%,24rem)]" />
    );
  }

  return (
    <aside
      className={`fixed inset-y-0 z-[96] w-full max-w-lg border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl transition-all ${
        withConversationOpen ? "right-0 md:right-[24rem]" : "right-0"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Preview</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${typeAccent(document.type)}`}>
              {document.type}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">{document.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            by {document.createdBy}
            {task ? ` - task: ${task.title}` : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto bg-black/25 p-4">
          {document.type === "spec" || document.type === "note" || document.type === "research" ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{document.content}</p>
          ) : (
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-200">
              <code>{document.content}</code>
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
}
