import { deals } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { withRequestTenant } from "./context.js";

const dealStages = new Set(["new", "qualified", "proposal", "won", "lost"] as const);

type DealStage = NonNullable<(typeof deals.$inferInsert)["stage"]>;

export const dealRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) => tx.select().from(deals).orderBy(deals.createdAt))
    );
    return reply.send({ ok: true, data: rows.map(toView) });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(deals).where(eq(deals.id, request.params.id)).limit(1)
      )
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
      return reply.status(400).send({
        ok: false,
        error: { code: "bad_request", message: "accountId and name are required" }
      });
    }
    if (!isDealStage(stage)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: "stage must be one of: new, qualified, proposal, won, lost"
        }
      });
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
            stage,
            valueCents
          })
          .returning()
      )
    );
    return reply.status(201).send({ ok: true, data: toView(row!) });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { stage?: string };
  }>("/:id", async (request, reply) => {
    const { stage } = request.body ?? {};
    if (!isDealStage(stage)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: "stage must be one of: new, qualified, proposal, won, lost"
        }
      });
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(deals)
          .set({ stage, updatedAt: new Date() })
          .where(eq(deals.id, request.params.id))
          .returning()
      )
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Deal not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });
};

function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && dealStages.has(value as DealStage);
}

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
