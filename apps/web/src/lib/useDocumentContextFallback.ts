"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "convex/react";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";

interface TaskRow {
  _id: Id<"tasks">;
  title: string;
  description: string;
  status?: string;
}

interface DocumentRow {
  _id: Id<"documents">;
  title: string;
  type: "deliverable" | "research" | "spec" | "note" | "markdown";
  content: string;
  createdBy?: string;
  createdAt?: number;
  path?: string;
  taskId?: Id<"tasks">;
}

interface MessageRow {
  _id: string;
  content?: string;
  text?: string;
  createdAt: number;
  fromUser?: boolean;
  agent?: { name?: string | null; avatar?: string | null } | null;
}

export interface ResolvedDocumentContext {
  _id: Id<"documents">;
  title: string;
  type: "deliverable" | "research" | "spec" | "note" | "markdown";
  content: string;
  createdBy: string;
  createdAt: number;
  path?: string;
  taskId?: Id<"tasks">;
  taskTitle?: string;
  taskStatus?: string;
  taskDescription?: string;
  originMessage?: string;
  conversationMessages: Array<{
    _id: string;
    content: string;
    createdAt: number;
    agentName: string | null;
    agentAvatar: string | null;
    fromUser: boolean;
  }>;
}

export function useDocumentContextFallback(documentId: Id<"documents">) {
  const tasksQuery = useQuery(api.tasks.list, { limit: 250 });
  const tasks = (tasksQuery ?? []) as TaskRow[];

  const documentRequests = useMemo(() => {
    const out: Record<string, { query: typeof api.documents.listForTask; args: { taskId: Id<"tasks"> } }> = {};
    for (const task of tasks) {
      out[`task_${task._id}`] = {
        query: api.documents.listForTask,
        args: { taskId: task._id },
      };
    }
    return out;
  }, [tasks]);

  const documentResults = useQueries(documentRequests);

  const documents = useMemo(() => {
    const rows: DocumentRow[] = [];
    for (const task of tasks) {
      const key = `task_${task._id}`;
      const result = documentResults[key];
      if (Array.isArray(result)) {
        rows.push(...(result as DocumentRow[]));
      }
    }
    return rows;
  }, [documentResults, tasks]);

  const selectedDocument = useMemo(() => {
    const targetId = String(documentId);
    return documents.find((doc) => String(doc._id) === targetId) ?? null;
  }, [documentId, documents]);

  const selectedTaskId = selectedDocument?.taskId;
  const selectedTaskQuery = useQuery(
    api.tasks.get,
    selectedTaskId ? { id: selectedTaskId } : "skip"
  );
  const taskMessagesQuery = useQuery(
    api.messages.list,
    selectedTaskId ? { channel: `task:${selectedTaskId}` } : "skip"
  );

  const selectedTask = (selectedTaskQuery ?? null) as TaskRow | null;
  const taskMessages = (taskMessagesQuery ?? []) as MessageRow[];

  const context = useMemo<ResolvedDocumentContext | null>(() => {
    if (!selectedDocument) return null;

    const orderedMessages = [...taskMessages].sort((a, b) => a.createdAt - b.createdAt);
    const conversationMessages = orderedMessages.map((msg) => ({
      _id: String(msg._id),
      content: (msg.content ?? msg.text ?? "").trim(),
      createdAt: msg.createdAt,
      agentName: msg.agent?.name ?? null,
      agentAvatar: msg.agent?.avatar ?? null,
      fromUser: Boolean(msg.fromUser),
    }));

    return {
      _id: selectedDocument._id,
      title: selectedDocument.title,
      type: selectedDocument.type,
      content: selectedDocument.content ?? "",
      createdBy: selectedDocument.createdBy || "Unknown",
      createdAt: selectedDocument.createdAt ?? 0,
      path: selectedDocument.path,
      taskId: selectedDocument.taskId,
      taskTitle: selectedTask?.title,
      taskStatus: selectedTask?.status,
      taskDescription: selectedTask?.description,
      originMessage: conversationMessages[0]?.content || undefined,
      conversationMessages,
    };
  }, [selectedDocument, selectedTask, taskMessages]);

  const documentsLoading =
    tasksQuery === undefined ||
    Object.values(documentResults).some((row) => row === undefined);
  const isLoading = documentsLoading || (selectedTaskId ? selectedTaskQuery === undefined : false);

  return {
    context,
    isLoading,
  };
}

