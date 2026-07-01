import "server-only";

import type { DistilledItemStatus, DistilledItemView, ListResponse } from "@felixos/shared-types";

import { apiFetch, apiPatch } from "./api";

export function fetchKnowledgeItems(
  params: {
    status?: DistilledItemStatus;
    entityId?: string;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.entityId) searchParams.set("entityId", params.entityId);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);
  const query = searchParams.toString();
  return apiFetch<ListResponse<DistilledItemView>>(`/knowledge/items${query ? `?${query}` : ""}`);
}

export function reviewKnowledgeItem(
  id: string,
  body: { status: DistilledItemStatus; correctionText?: string | null }
) {
  return apiPatch<DistilledItemView>(`/knowledge/items/${id}`, body);
}
