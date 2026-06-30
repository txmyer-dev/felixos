import { entities } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendCreated, sendNotFound, sendSuccess } from "../lib/responses.js";
import { withRequestTenant } from "./context.js";

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(entities).orderBy(entities.createdAt)
      )
    );
    return sendSuccess(reply, rows.map(toView));
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(entities).where(eq(entities.id, request.params.id)).limit(1)
      )
    );
    if (!row) {
      return sendNotFound(reply, "Account not found");
    }
    return sendSuccess(reply, toView(row));
  });

  fastify.post<{
    Body: { name?: string; lifecycleStage?: string };
  }>("/", async (request, reply) => {
    const { name, lifecycleStage = "prospect" } = request.body ?? {};
    if (!name) {
      return sendBadRequest(reply, "name is required");
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(entities)
          .values({
            id: randomUUID(),
            tenantId: request.tenantId,
            name,
            lifecycleStage: lifecycleStage as (typeof entities.$inferInsert)["lifecycleStage"]
          })
          .returning()
      )
    );
    return sendCreated(reply, toView(row!));
  });

  fastify.patch<{
    Params: { id: string };
    Body: { lifecycleStage?: string };
  }>("/:id", async (request, reply) => {
    const { lifecycleStage } = request.body ?? {};
    if (!lifecycleStage) {
      return sendBadRequest(reply, "lifecycleStage is required");
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(entities)
          .set({
            lifecycleStage: lifecycleStage as (typeof entities.$inferInsert)["lifecycleStage"],
            updatedAt: new Date()
          })
          .where(eq(entities.id, request.params.id))
          .returning()
      )
    );
    if (!row) {
      return sendNotFound(reply, "Account not found");
    }
    return sendSuccess(reply, toView(row));
  });
};

function toView(row: typeof entities.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    lifecycleStage: row.lifecycleStage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
