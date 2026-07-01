import "server-only";

import type {
  ListResponse,
  N8nExecutionView,
  N8nNeedsAttentionItem,
  N8nWorkflowView
} from "@felixos/shared-types";

import { apiFetch, apiPost } from "./api";

type N8nPaginated<T> = { items: T[]; nextCursor: string | null };

export function fetchWorkflows() {
  return apiFetch<N8nPaginated<N8nWorkflowView>>("/n8n/workflows");
}

export function fetchExecutions() {
  return apiFetch<N8nPaginated<N8nExecutionView>>("/n8n/executions");
}

export function fetchNeedsAttention() {
  return apiFetch<N8nNeedsAttentionItem[]>("/n8n/needs-attention");
}

export function acknowledgeExecution(id: string) {
  return apiPost<{ acknowledged: boolean; executionId: string; alreadyAcknowledged: boolean }>(
    `/n8n/executions/${id}/acknowledge`
  );
}

export function toListResponse<T>(result: N8nPaginated<T>): ListResponse<T> {
  return { items: result.items, pageInfo: { nextCursor: result.nextCursor } };
}
