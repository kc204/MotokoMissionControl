"use client";

import { useQuery } from "convex/react";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";

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

interface ConversationMessage {
  _id: string;
  content: string;
  createdAt: number;
  agentName: string | null;
  fromUser: boolean;
}

interface DocumentContext {
  title: string;
  type: string;
  createdBy: string;
  createdAt: number;
  taskTitle?: string;
  taskDescription?: string;
  originMessage?: string;
  conversationMessages: ConversationMessage[];
}

interface DocumentConversationTrayProps {
  documentId: Id<"documents">;
  onClose: () => void;
  onOpenPreview: () => void;
}

export default function DocumentConversationTray({
  documentId,
  onClose,
  onOpenPreview,
}: DocumentConversationTrayProps) {
  const contextQuery = useQuery(api.documents.getWithContext, { id: documentId });
  const context = contextQuery as DocumentContext | undefined;

  if (!context) {
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
            <p className="text-sm text-zinc-200">{context.title}</p>
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
              <p>Type: {context.type}</p>
              <p>Author: {context.createdBy}</p>
              <p>Created: {timeAgo(context.createdAt)}</p>
              {context.taskTitle && <p>Task: {context.taskTitle}</p>}
            </div>
          </section>

          {context.taskDescription && (
            <section className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Prompt</p>
              <div className="mt-2 text-sm leading-relaxed text-zinc-200">
                <div className="whitespace-pre-wrap">{context.taskDescription}</div>
              </div>
            </section>
          )}

          {context.originMessage && (
            <section className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Origin Message</p>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                {context.originMessage}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent Thread</p>
            <div className="mt-2 space-y-2">
              {context.conversationMessages.map((msg) => (
                <div key={msg._id} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{msg.agentName || (msg.fromUser ? "HQ" : "System")}</span>
                    <span>{timeAgo(msg.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-zinc-200">{msg.content}</div>
                </div>
              ))}
              {context.conversationMessages.length === 0 && (
                <p className="text-xs text-zinc-500">No message thread was found for this document.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
