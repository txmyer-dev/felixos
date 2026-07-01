import "server-only";

import type { PendingActionStatus, PendingActionView } from "@felixos/shared-types";

import { apiFetch, apiPatch, apiPost } from "./api";

export function fetchPendingActions(status: PendingActionStatus = "pending") {
  return apiFetch<PendingActionView[]>(`/agent/pending?status=${status}`);
}

export function approvePendingAction(id: string) {
  return apiPost<PendingActionView>(`/agent/pending/${id}/approve`);
}

export function rejectPendingAction(id: string) {
  return apiPost<PendingActionView>(`/agent/pending/${id}/reject`);
}

export function editPendingAction(id: string, text: string) {
  return apiPatch<PendingActionView>(`/agent/pending/${id}`, { text });
}

export function pendingActionText(action: PendingActionView): string {
  const payload = action.payload;
  for (const key of ["body", "summary", "content", "subject", "youtubeUrl", "to"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return action.agentContext ?? action.skillName;
}
