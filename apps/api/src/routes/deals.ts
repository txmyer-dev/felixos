import { deals } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendCreated, sendNotFound, sendSuccess } from "../lib/responses.js";
import { withRequestTenant } from "./context.js";

export const dealRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) => tx.select().from(deals).orderBy(deals.createdAt))
    );
    return sendSuccess(reply, rows.map(toView));
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(deals).where(eq(deals.id, request.params.id)).limit(1)
      )
    );
    if (!row) {
      return sendNotFound(reply, "Deal not found");
    }
    return sendSuccess(reply, toView(row));
  });

  fastify.post<{
    Body: { accountId?: string; name?: string; stage?: string; valueCents?: number };
  }>("/", async (request, reply) => {
    const { accountId, name, stage = "new", valueCents } = request.body ?? {};
    if (!accountId || !name) {
      return sendBadRequest(reply, "accountId and name are required");
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(deals)
          .values({
            id: randomUUID(),
            tenantId: request.tenantId,
            accountId,
            name,
            stage: stage as (typeof deals.$inferInsert)["stage"],
            valueCents
          })
          .returning()
      )
    );
    return sendCreated(reply, toView(row!));
  });

  fastify.patch<{
    Params: { id: string };
    Body: { stage?: string };
  }>("/:id", async (request, reply) => {
    const { stage } = request.body ?? {};
    if (!stage) {
      return sendBadRequest(reply, "stage is required");
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(deals)
          .set({ stage: stage as (typeof deals.$inferInsert)["stage"], updatedAt: new Date() })
          .where(eq(deals.id, request.params.id))
          .returning()
      )
    );
    if (!row) {
      return sendNotFound(reply, "Deal not found");
    }
    return sendSuccess(reply, toView(row));
  });
};

function toView(row: typeof deals.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    accountId: row.accountId,
    name: row.name,
    stage: row.stage,
    valueCents: row.valueCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
