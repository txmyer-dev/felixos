import { deals } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendCreated, sendNotFound, sendSuccess } from "../lib/responses.js";
import { withRequestTenant } from "./context.js";

const dealStages = new Set(["new", "qualified", "proposal", "won", "lost"] as const);

type DealStage = NonNullable<(typeof deals.$inferInsert)["stage"]>;

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
    if (!isDealStage(stage)) {
      return sendBadRequest(reply, "stage must be one of: new, qualified, proposal, won, lost");
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
    return sendCreated(reply, toView(row!));
  });

  fastify.patch<{
    Params: { id: string };
    Body: { stage?: string };
  }>("/:id", async (request, reply) => {
    const { stage } = request.body ?? {};
    if (!isDealStage(stage)) {
      return sendBadRequest(reply, "stage must be one of: new, qualified, proposal, won, lost");
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
      return sendNotFound(reply, "Deal not found");
    }
    return sendSuccess(reply, toView(row));
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
