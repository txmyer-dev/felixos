import { interactions } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { withRequestTenant } from "./context.js";

const interactionKinds = new Set(["email", "meeting", "call", "note", "task", "other"] as const);

type InteractionKind = (typeof interactions.$inferInsert)["kind"];

export const interactionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(interactions).orderBy(interactions.occurredAt)
      )
    );
    return reply.send({ ok: true, data: rows.map(toView) });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(interactions).where(eq(interactions.id, request.params.id)).limit(1)
      )
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Interaction not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });

  fastify.post<{
    Body: {
      accountId?: string;
      contactId?: string;
      kind?: string;
      occurredAt?: string;
      summary?: string;
    };
  }>("/", async (request, reply) => {
    const { accountId, contactId, kind, occurredAt, summary } = request.body ?? {};
    if (!accountId || !kind || !occurredAt || !summary) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: "accountId, kind, occurredAt, and summary are required"
        }
      });
    }
    if (!isInteractionKind(kind)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "bad_request",
          message: "kind must be one of: email, meeting, call, note, task, other"
        }
      });
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(interactions)
          .values({
            id: randomUUID(),
            tenantId: request.tenantId,
            accountId,
            contactId: contactId ?? null,
            kind,
            occurredAt: new Date(occurredAt),
            summary
          })
          .returning()
      )
    );
    return reply.status(201).send({ ok: true, data: toView(row!) });
  });
};

function isInteractionKind(value: unknown): value is InteractionKind {
  return typeof value === "string" && interactionKinds.has(value as InteractionKind);
}

function toView(row: typeof interactions.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    accountId: row.accountId,
    contactId: row.contactId,
    kind: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
