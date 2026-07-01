import { n8nExecutionAcknowledgments } from "@felixos/db";
import { inArray } from "drizzle-orm";

import type { ScopedDatabaseClient } from "@felixos/db";
import type { N8nClient, N8nExecution } from "@felixos/integrations";
import type { N8nNeedsAttentionItem } from "@felixos/shared-types";

import { getTenantN8nWorkflowIds } from "./n8n-tenant-scope.js";

export async function listN8nNeedsAttention(opts: {
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  n8nClient: N8nClient;
}): Promise<N8nNeedsAttentionItem[]> {
  const workflowIds = await getTenantN8nWorkflowIds(opts.scopedDb);
  if (workflowIds.size === 0) return [];

  const [errorExecutions, crashedExecutions] = await Promise.all([
    opts.n8nClient.listExecutions({ status: "error", limit: 100 }),
    opts.n8nClient.listExecutions({ status: "crashed", limit: 100 })
  ]);
  const failed = [...errorExecutions.items, ...crashedExecutions.items].filter((execution) =>
    execution.workflowId ? workflowIds.has(execution.workflowId) : false
  );
  if (failed.length === 0) return [];

  const failedIds = failed.map((execution) => execution.id);
  const acknowledgedRows = await opts.scopedDb.transaction((tx) =>
    tx
      .select({ n8nExecutionId: n8nExecutionAcknowledgments.n8nExecutionId })
      .from(n8nExecutionAcknowledgments)
      .where(inArray(n8nExecutionAcknowledgments.n8nExecutionId, failedIds))
  );
  const acknowledgedIds = new Set(acknowledgedRows.map((row) => row.n8nExecutionId));

  return failed
    .filter((execution) => !acknowledgedIds.has(execution.id))
    .map((execution) => toNeedsAttentionItem(execution, opts.n8nClient.baseUrl));
}

function toNeedsAttentionItem(execution: N8nExecution, baseUrl: string): N8nNeedsAttentionItem {
  const workflowId = execution.workflowId ?? "unknown";
  return {
    workflowName: execution.workflowName ?? workflowId,
    n8nWorkflowId: workflowId,
    executionId: execution.id,
    failedAt: execution.stoppedAt ?? execution.startedAt ?? new Date(0).toISOString(),
    errorSummary: summarizeError(execution.error ?? execution.data),
    n8nUrl: `${baseUrl}/execution/${encodeURIComponent(execution.id)}`
  };
}

function summarizeError(error: unknown): string {
  if (!error) return "n8n execution failed";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error === "string") return candidate.error;
  }
  return "n8n execution failed";
}
