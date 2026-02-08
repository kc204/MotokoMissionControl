"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type LiveFeedType = "all" | "task_created" | "task_updated" | "message_sent" | "agent_status_changed" | "document_created";
type DocumentType = "all" | "deliverable" | "research" | "spec" | "note";
type TabId = "live-feed" | "documents";

const liveFeedFilters: Array<{ id: LiveFeedType; label: string }> = [
  { id: "all", label: "All" },
  { id: "task_created", label: "Created" },
  { id: "task_updated", label: "Updates" },
  { id: "message_sent", label: "Comments" },
  { id: "document_created", label: "Docs" },
  { id: "agent_status_changed", label: "Status" },
];

const documentFilters: Array<{ id: DocumentType; label: string }> = [
  { id: "all", label: "All" },
  { id: "deliverable", label: "Deliverables" },
  { id: "research", label: "Research" },
  { id: "spec", label: "Specs" },
  { id: "note", label: "Notes" },
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

export default function RightSidebar({
  selectedDocumentId,
  onSelectDocument,
  onPreviewDocument,
  className = "",
}: {
  selectedDocumentId: Id<"documents"> | null;
  onSelectDocument: (id: Id<"documents"> | null) => void;
  onPreviewDocument: (id: Id<"documents">) => void;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("live-feed");
  const [selectedFeedType, setSelectedFeedType] = useState<LiveFeedType>("all");
  const [selectedDocumentType, setSelectedDocumentType] = useState<DocumentType>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | undefined>(undefined);

  const agentsQuery = useQuery(api.agents.list);
  const activitiesQuery =
    useQuery(api.activities.listFiltered, {
      limit: 120,
      type: selectedFeedType === "all" ? undefined : selectedFeedType,
      agentId: selectedAgentId,
    });
  const documentsQuery =
    useQuery(api.documents.listAll, {
      type: selectedDocumentType === "all" ? undefined : selectedDocumentType,
    });

  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);
  const activities = useMemo(() => activitiesQuery ?? [], [activitiesQuery]);
  const documents = useMemo(() => documentsQuery ?? [], [documentsQuery]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent._id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const visibleDocuments = useMemo(() => {
    if (!selectedAgent) return documents;
    return documents.filter((doc) => doc.createdBy === selectedAgent.name);
  }, [documents, selectedAgent]);

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,21,0.95),rgba(6,9,14,0.95))] ${className}`}
      aria-label="Live Feed and Documents"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          {activeTab === "live-feed" ? "Live Feed" : "Documents"}
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-2 border-b border-white/10 text-xs font-semibold uppercase tracking-[0.16em]">
        <button
          type="button"
          onClick={() => setActiveTab("live-feed")}
          className={`px-3 py-2.5 transition-colors ${
            activeTab === "live-feed"
              ? "bg-white/[0.04] text-cyan-200"
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
          }`}
        >
          Feed
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`px-3 py-2.5 transition-colors ${
            activeTab === "documents"
              ? "bg-white/[0.04] text-cyan-200"
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
          }`}
        >
          Docs
        </button>
      </div>

      <div className="space-y-3 border-b border-white/10 px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {(activeTab === "live-feed" ? liveFeedFilters : documentFilters).map((filter) => {
            const selected =
              activeTab === "live-feed"
                ? selectedFeedType === filter.id
                : selectedDocumentType === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  if (activeTab === "live-feed") {
                    setSelectedFeedType(filter.id as LiveFeedType);
                  } else {
                    setSelectedDocumentType(filter.id as DocumentType);
                  }
                }}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  selected
                    ? "border-cyan-300/35 bg-cyan-500/15 text-cyan-200"
                    : "border-white/10 bg-black/25 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedAgentId(undefined)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
              selectedAgentId === undefined
                ? "border-cyan-300/35 bg-cyan-500/15 text-cyan-200"
                : "border-white/10 bg-black/25 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
            }`}
          >
            All Agents
          </button>
          {agents.slice(0, 8).map((agent) => (
            <button
              key={agent._id}
              type="button"
              onClick={() => setSelectedAgentId(agent._id)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                selectedAgentId === agent._id
                  ? "border-cyan-300/35 bg-cyan-500/15 text-cyan-200"
                  : "border-white/10 bg-black/25 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "live-feed" ? (
        <div className="h-[min(68vh,760px)] space-y-2 overflow-y-auto px-3 py-3">
          {activities.map((item) => (
            <div key={item._id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
              <p className="text-sm text-zinc-200">{item.message}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{timeAgo(item.createdAt)}</p>
            </div>
          ))}
          {activities.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 bg-black/25 px-3 py-5 text-center text-xs text-zinc-500">
              No activity for the selected filters.
            </p>
          )}
        </div>
      ) : (
        <div className="h-[min(68vh,760px)] space-y-2 overflow-y-auto px-3 py-3">
          {visibleDocuments.map((doc) => (
            <div
              key={doc._id}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                selectedDocumentId === doc._id
                  ? "border-cyan-300/35 bg-cyan-500/10"
                  : "border-white/10 bg-black/30 hover:bg-white/[0.05]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDocument(selectedDocumentId === doc._id ? null : doc._id)}
                className="block w-full text-left"
              >
                <p className="truncate text-sm text-zinc-200">{doc.title}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  {doc.type} - {doc.createdBy}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onPreviewDocument(doc._id)}
                className="mt-2 rounded-lg border border-cyan-300/30 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold text-cyan-200"
              >
                Preview
              </button>
            </div>
          ))}
          {visibleDocuments.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 bg-black/25 px-3 py-5 text-center text-xs text-zinc-500">
              No documents for the selected filters.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
