"use client";

import KanbanBoard from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import RightSidebar from "@/components/RightSidebar";
import DocumentConversationTray from "@/components/DocumentConversationTray";
import DocumentPreviewTray from "@/components/DocumentPreviewTray";

export default function KanbanPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);
  const [showConversationTray, setShowConversationTray] = useState(false);
  const [showPreviewTray, setShowPreviewTray] = useState(false);
  const tasksQuery = useQuery(api.tasks.list);
  const tasks = useMemo(() => tasksQuery ?? [], [tasksQuery]);

  const stats = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const review = tasks.filter((t) => t.status === "review").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { total: tasks.length, inProgress, review, done };
  }, [tasks]);

  const selectDocument = (id: Id<"documents"> | null) => {
    if (!id) {
      setSelectedDocumentId(null);
      setShowConversationTray(false);
      setShowPreviewTray(false);
      return;
    }
    setSelectedDocumentId(id);
    setShowConversationTray(true);
    setShowPreviewTray(true);
  };

  const previewDocument = (id: Id<"documents">) => {
    setSelectedDocumentId(id);
    setShowConversationTray(true);
    setShowPreviewTray(true);
  };

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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <KanbanBoard onSelectTask={setSelectedTaskId} />
        <RightSidebar
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={selectDocument}
          onPreviewDocument={previewDocument}
        />
      </div>
      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {selectedTaskId && (
        <>
          <div
            className="fixed inset-0 z-[89] bg-black/60 backdrop-blur-[1px]"
            onClick={() => setSelectedTaskId(null)}
            aria-hidden="true"
          />
          <TaskDetailPanel
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onPreviewDocument={previewDocument}
          />
        </>
      )}

      {selectedDocumentId && showConversationTray && (
        <>
          <div
            className="fixed inset-0 z-[93] bg-black/45 backdrop-blur-[1px]"
            onClick={() => {
              setShowConversationTray(false);
              setShowPreviewTray(false);
              setSelectedDocumentId(null);
            }}
            aria-hidden="true"
          />
          <DocumentConversationTray
            documentId={selectedDocumentId}
            onClose={() => {
              setShowConversationTray(false);
              setShowPreviewTray(false);
              setSelectedDocumentId(null);
            }}
            onOpenPreview={() => setShowPreviewTray(true)}
          />
        </>
      )}

      {selectedDocumentId && showPreviewTray && (
        <DocumentPreviewTray
          documentId={selectedDocumentId}
          withConversationOpen={showConversationTray}
          onClose={() => setShowPreviewTray(false)}
        />
      )}
    </main>
  );
}
