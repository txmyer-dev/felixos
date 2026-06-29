import { deals } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export const dealRoutes: FastifyPluginAsync = fp(async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(deals).orderBy(deals.createdAt)
    );
    return reply.send({ ok: true, data: rows.map(toView) });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(deals).where(eq(deals.id, request.params.id)).limit(1)
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Deal not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });

  fastify.post<{
    Body: { accountId?: string; name?: string; stage?: string; valueCents?: number };
  }>("/", async (request, reply) => {
    const { accountId, name, stage = "new", valueCents } = request.body ?? {};
    if (!accountId || !name) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: "bad_request", message: "accountId and name are required" } });
    }
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx
        .insert(deals)
        .values({
          id: randomUUID(),
          tenantId: request.tenantId,
          accountId,
          name,
          stage: stage as typeof deals.$inferInsert["stage"],
          valueCents
        })
        .returning()
    );
    return reply.status(201).send({ ok: true, data: toView(row!) });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { stage?: string };
  }>("/:id", async (request, reply) => {
    const { stage } = request.body ?? {};
    if (!stage) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: "bad_request", message: "stage is required" } });
    }
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx
        .update(deals)
        .set({ stage: stage as typeof deals.$inferInsert["stage"], updatedAt: new Date() })
        .where(eq(deals.id, request.params.id))
        .returning()
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Deal not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });
});

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
