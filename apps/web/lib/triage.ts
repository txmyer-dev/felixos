import "server-only";

import type { N8nNeedsAttentionItem, PendingActionView } from "@felixos/shared-types";

import { fetchPendingActions } from "./agent";
import { fetchNeedsAttention } from "./n8n";

export type TriageItem =
  | { kind: "n8n"; severity: 2; occurredAt: string; item: N8nNeedsAttentionItem }
  | { kind: "pending"; severity: 1; occurredAt: string; item: PendingActionView };

export async function fetchTriageItems(): Promise<TriageItem[]> {
  const [pendingActions, needsAttention] = await Promise.all([
    fetchPendingActions("pending"),
    fetchNeedsAttention()
  ]);
  return rankTriageItems([
    ...needsAttention.map<TriageItem>((item) => ({
      kind: "n8n",
      severity: 2,
      occurredAt: item.failedAt,
      item
    })),
    ...pendingActions.map<TriageItem>((item) => ({
      kind: "pending",
      severity: 1,
      occurredAt: item.createdAt,
      item
    }))
  ]);
}

export function rankTriageItems(items: TriageItem[]): TriageItem[] {
  return [...items].sort((a, b) => {
    if (a.severity !== b.severity) return b.severity - a.severity;
    return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  });
}
