import { n8nExecutionAcknowledgments } from "@felixos/db";
import { isN8nUnavailableError } from "@felixos/integrations";
import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import type { N8nExecutionListFilters, N8nWorkflowListFilters } from "@felixos/integrations";

import { listN8nNeedsAttention } from "../lib/n8n-needs-attention.js";
import { getTenantN8nWorkflowIds } from "../lib/n8n-tenant-scope.js";
import { sendError, sendNotFound, sendSuccess } from "../lib/responses.js";
import { clampLimit } from "../lib/validation.js";
import { withRequestTenant } from "./context.js";

type WorkflowQuery = {
  active?: string;
  tags?: string;
  name?: string;
  projectId?: string;
  limit?: string;
  cursor?: string;
};

type ExecutionQuery = {
  status?: N8nExecutionListFilters["status"];
  workflowId?: string;
  projectId?: string;
  limit?: string;
  cursor?: string;
};

export const n8nRoutes: FastifyPluginAsync = async (fastify) => {
  // n8n has no concept of tenants, so every list/get below is filtered against
  // tenantN8nSkills (the tenant's registered workflow ids) to keep one tenant
  // from reading another tenant's workflows or executions.
  fastify.get<{ Querystring: WorkflowQuery }>("/workflows", async (request, reply) =>
    withN8nErrorHandling(reply, async () => {
      const workflowIds = await withRequestTenant(request, () =>
        getTenantN8nWorkflowIds(request.server.scopedDb)
      );
      const result = await request.server.n8n.listWorkflows(toWorkflowFilters(request.query));
      return sendSuccess(reply, {
        ...result,
        items: result.items.filter((workflow) => workflowIds.has(workflow.id))
      });
    })
  );

  fastify.get<{ Params: { id: string } }>("/workflows/:id", async (request, reply) =>
    withN8nErrorHandling(reply, async () => {
      const workflowIds = await withRequestTenant(request, () =>
        getTenantN8nWorkflowIds(request.server.scopedDb)
      );
      if (!workflowIds.has(request.params.id)) {
        return sendNotFound(reply, "n8n workflow not found");
      }
      const workflow = await request.server.n8n.getWorkflow(request.params.id);
      if (!workflow) return sendNotFound(reply, "n8n workflow not found");
      return sendSuccess(reply, workflow);
    })
  );

  fastify.get<{ Querystring: ExecutionQuery }>("/executions", async (request, reply) =>
    withN8nErrorHandling(reply, async () => {
      const workflowIds = await withRequestTenant(request, () =>
        getTenantN8nWorkflowIds(request.server.scopedDb)
      );
      if (request.query.workflowId && !workflowIds.has(request.query.workflowId)) {
        return sendSuccess(reply, { items: [], nextCursor: null });
      }
      const result = await request.server.n8n.listExecutions(toExecutionFilters(request.query));
      return sendSuccess(reply, {
        ...result,
        items: result.items.filter((execution) =>
          execution.workflowId ? workflowIds.has(execution.workflowId) : false
        )
      });
    })
  );

  fastify.get<{ Params: { id: string } }>("/executions/:id", async (request, reply) =>
    withN8nErrorHandling(reply, async () => {
      const workflowIds = await withRequestTenant(request, () =>
        getTenantN8nWorkflowIds(request.server.scopedDb)
      );
      const execution = await request.server.n8n.getExecution(request.params.id);
      if (!execution?.workflowId || !workflowIds.has(execution.workflowId)) {
        return sendNotFound(reply, "n8n execution not found");
      }
      return sendSuccess(reply, execution);
    })
  );

  fastify.get("/needs-attention", async (request, reply) =>
    withN8nErrorHandling(reply, async () => {
      const items = await withRequestTenant(request, () =>
        listN8nNeedsAttention({
          tenantId: request.tenantId,
          scopedDb: request.server.scopedDb,
          n8nClient: request.server.n8n
        })
      );
      return sendSuccess(reply, items);
    })
  );

  fastify.post<{ Params: { id: string } }>(
    "/executions/:id/acknowledge",
    async (request, reply) => {
      const [row] = await withRequestTenant(request, () =>
        request.server.scopedDb.transaction((tx) =>
          tx
            .insert(n8nExecutionAcknowledgments)
            .values({
              id: randomUUID(),
              tenantId: request.tenantId,
              n8nExecutionId: request.params.id
            })
            .onConflictDoNothing({
              target: [
                n8nExecutionAcknowledgments.tenantId,
                n8nExecutionAcknowledgments.n8nExecutionId
              ]
            })
            .returning()
        )
      );

      return sendSuccess(reply, {
        acknowledged: true,
        executionId: request.params.id,
        alreadyAcknowledged: row === undefined
      });
    }
  );
};

async function withN8nErrorHandling(
  reply: Parameters<typeof sendSuccess>[0],
  callback: () => Promise<void>
) {
  try {
    return await callback();
  } catch (error) {
    if (isN8nUnavailableError(error)) {
      return sendError(reply, 503, "n8n_unavailable", error.message);
    }
    throw error;
  }
}

function toWorkflowFilters(query: WorkflowQuery): N8nWorkflowListFilters {
  return {
    ...(query.active !== undefined ? { active: query.active === "true" } : {}),
    ...(query.tags ? { tags: query.tags } : {}),
    ...(query.name ? { name: query.name } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    limit: clampLimit(query.limit, 100, 250),
    ...(query.cursor ? { cursor: query.cursor } : {})
  };
}

function toExecutionFilters(query: ExecutionQuery): N8nExecutionListFilters {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.workflowId ? { workflowId: query.workflowId } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    limit: clampLimit(query.limit, 100, 250),
    ...(query.cursor ? { cursor: query.cursor } : {})
  };
}
