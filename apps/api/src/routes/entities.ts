import { entities } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export const entityRoutes: FastifyPluginAsync = fp(async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(entities).orderBy(entities.createdAt)
    );
    return reply.send({ ok: true, data: rows.map(toView) });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(entities).where(eq(entities.id, request.params.id)).limit(1)
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Account not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });

  fastify.post<{
    Body: { name?: string; lifecycleStage?: string };
  }>("/", async (request, reply) => {
    const { name, lifecycleStage = "prospect" } = request.body ?? {};
    if (!name) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: "bad_request", message: "name is required" } });
    }
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx
        .insert(entities)
        .values({
          id: randomUUID(),
          tenantId: request.tenantId,
          name,
          lifecycleStage: lifecycleStage as typeof entities.$inferInsert["lifecycleStage"]
        })
        .returning()
    );
    return reply.status(201).send({ ok: true, data: toView(row!) });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { lifecycleStage?: string };
  }>("/:id", async (request, reply) => {
    const { lifecycleStage } = request.body ?? {};
    if (!lifecycleStage) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: "bad_request", message: "lifecycleStage is required" } });
    }
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx
        .update(entities)
        .set({
          lifecycleStage: lifecycleStage as typeof entities.$inferInsert["lifecycleStage"],
          updatedAt: new Date()
        })
        .where(eq(entities.id, request.params.id))
        .returning()
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Account not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });
});

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
