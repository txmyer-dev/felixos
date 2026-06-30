import { n8nExecutionAcknowledgments, tenantN8nSkills } from "@felixos/db";
import { inArray } from "drizzle-orm";

import type { ScopedDatabaseClient } from "@felixos/db";
import type { N8nClient, N8nExecution, N8nExecutionStatus } from "@felixos/integrations";
import type { N8nNeedsAttentionItem } from "@felixos/shared-types";

const maxPagesPerStatus = 20;
const pageLimit = 250;

export async function listN8nNeedsAttention(opts: {
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  n8nClient: N8nClient;
}): Promise<N8nNeedsAttentionItem[]> {
  const registrations = await opts.scopedDb.transaction((tx) =>
    tx
      .select({
        n8nWorkflowId: tenantN8nSkills.n8nWorkflowId,
        skillName: tenantN8nSkills.skillName
      })
      .from(tenantN8nSkills)
  );

  const workflowIds = new Set(registrations.map((row) => row.n8nWorkflowId));
  if (workflowIds.size === 0) return [];

  const [errorExecutions, crashedExecutions] = await Promise.all([
    fetchAllExecutions(opts.n8nClient, "error"),
    fetchAllExecutions(opts.n8nClient, "crashed")
  ]);
  const failed = [...errorExecutions, ...crashedExecutions].filter((execution) =>
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

// listExecutions is cursor-paginated; a single page (n8n caps `limit` at 250)
// can silently omit older failures once a tenant's shared n8n instance has
// accumulated more than one page of errors. Page through to completion, bounded
// by maxPagesPerStatus so a runaway n8n instance can't make this call unbounded.
async function fetchAllExecutions(
  n8nClient: N8nClient,
  status: N8nExecutionStatus
): Promise<N8nExecution[]> {
  const items: N8nExecution[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPagesPerStatus; page += 1) {
    const result = await n8nClient.listExecutions({
      status,
      limit: pageLimit,
      ...(cursor ? { cursor } : {})
    });
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return items;
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
