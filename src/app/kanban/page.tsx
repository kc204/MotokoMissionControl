"use client";

import KanbanBoard from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import RightSidebar from "@/components/RightSidebar";
import DocumentConversationTray from "@/components/DocumentConversationTray";
import DocumentPreviewTray from "@/components/DocumentPreviewTray";
import AgentsSidebarPanel from "@/components/AgentsSidebarPanel";

export default function KanbanPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);
  const [showConversationTray, setShowConversationTray] = useState(false);
  const [showPreviewTray, setShowPreviewTray] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const tasksQuery = useQuery(api.tasks.list);
  const tasks = useMemo(() => tasksQuery ?? [], [tasksQuery]);

  const stats = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const testing = tasks.filter((t) => t.status === "testing").length;
    const review = tasks.filter((t) => t.status === "review").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { total: tasks.length, inProgress, testing, review, done };
  }, [tasks]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLeftDrawerOpen(false);
        setRightDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
              <span className="text-xs uppercase tracking-wider text-zinc-500">Testing</span>
              <span className="font-mono text-sm text-fuchsia-300">{stats.testing}</span>
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
        <div className="xl:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLeftDrawerOpen(true);
              setRightDrawerOpen(false);
            }}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            Team
          </button>
          <button
            type="button"
            onClick={() => {
              setRightDrawerOpen(true);
              setLeftDrawerOpen(false);
            }}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            Live Feed
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <AgentsSidebarPanel
          className="hidden xl:block"
          onSelectAgent={() => {
            setLeftDrawerOpen(false);
          }}
        />

        <div className="min-w-0">
          <KanbanBoard onSelectTask={setSelectedTaskId} selectedTaskId={selectedTaskId} />
        </div>
        <RightSidebar
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={selectDocument}
          onPreviewDocument={previewDocument}
          className="hidden xl:block"
        />
      </div>
      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {(leftDrawerOpen || rightDrawerOpen) && (
        <div
          className="fixed inset-0 z-[87] bg-black/60 backdrop-blur-[1px] xl:hidden"
          onClick={() => {
            setLeftDrawerOpen(false);
            setRightDrawerOpen(false);
          }}
          aria-hidden="true"
        />
      )}

      {leftDrawerOpen && (
        <div className="fixed inset-y-0 left-0 z-[88] w-[88vw] max-w-[320px] p-3 xl:hidden">
          <AgentsSidebarPanel
            className="h-full"
            onSelectAgent={() => {
              setLeftDrawerOpen(false);
            }}
          />
        </div>
      )}

      {rightDrawerOpen && (
        <div className="fixed inset-y-0 right-0 z-[88] w-[92vw] max-w-[380px] p-3 xl:hidden">
          <RightSidebar
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={selectDocument}
            onPreviewDocument={previewDocument}
            className="h-full"
          />
        </div>
      )}

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
