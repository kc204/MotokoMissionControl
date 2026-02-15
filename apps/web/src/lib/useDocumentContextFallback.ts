"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@motoko/db";
import type { Id } from "@motoko/db";

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
  const contextQuery = useQuery(api.documents.getWithContext, { id: documentId });

  const context = useMemo<ResolvedDocumentContext | null>(() => {
    if (!contextQuery) return null;

    const conversationMessages = Array.isArray(contextQuery.conversationMessages)
      ? contextQuery.conversationMessages.map((msg: any) => ({
          _id: String(msg._id),
          content: (msg.content ?? "").trim(),
          createdAt: msg.createdAt ?? 0,
          agentName: msg.agentName ?? null,
          agentAvatar: msg.agentAvatar ?? null,
          fromUser: Boolean(msg.fromUser),
        }))
      : [];

    return {
      _id: contextQuery._id,
      title: contextQuery.title,
      type: contextQuery.type,
      content: contextQuery.content ?? "",
      createdBy: contextQuery.createdBy || "Unknown",
      createdAt: contextQuery.createdAt ?? 0,
      path: contextQuery.path,
      taskId: contextQuery.taskId,
      taskTitle: contextQuery.taskTitle ?? undefined,
      taskStatus: contextQuery.taskStatus ?? undefined,
      taskDescription: contextQuery.taskDescription ?? undefined,
      originMessage: contextQuery.originMessage ?? undefined,
      conversationMessages,
    };
  }, [contextQuery]);

  const isLoading = contextQuery === undefined;

  return {
    context,
    isLoading,
  };
}
