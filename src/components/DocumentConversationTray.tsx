"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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

export default function DocumentConversationTray({
  documentId,
  onClose,
  onOpenPreview,
}: {
  documentId: Id<"documents">;
  onClose: () => void;
  onOpenPreview: () => void;
}) {
  const document = useQuery(api.documents.get, { id: documentId });
  const task = useQuery(api.tasks.get, document?.taskId ? { id: document.taskId } : "skip");
  const messagesQuery = useQuery(
    api.messages.list,
    document?.taskId ? { channel: `task:${document.taskId}` } : "skip"
  );
  const messages = useMemo(() => messagesQuery ?? [], [messagesQuery]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages]
  );

  if (!document) {
    return (
      <aside className="fixed inset-y-0 right-0 z-[95] w-full max-w-md border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl" />
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[95] w-full max-w-md border-l border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.98),rgba(7,11,18,0.98))] shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Context</p>
            <p className="text-sm text-zinc-200">{document.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPreview}
              className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Document Metadata</p>
            <div className="mt-2 space-y-1.5 text-sm text-zinc-300">
              <p>Type: {document.type}</p>
              <p>Author: {document.createdBy}</p>
              <p>Created: {timeAgo(document.createdAt)}</p>
            </div>
          </section>

          {task && (
            <section className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Prompt</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                {task.description || "No task prompt captured."}
              </p>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent Thread</p>
            <div className="mt-2 space-y-2">
              {sortedMessages.map((msg) => (
                <div key={msg._id} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{msg.agent?.name || (msg.fromUser ? "HQ" : "System")}</span>
                    <span>{timeAgo(msg.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-200">{msg.text || msg.content}</p>
                </div>
              ))}
              {sortedMessages.length === 0 && (
                <p className="text-xs text-zinc-500">No message thread was found for this document.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
