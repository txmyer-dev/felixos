import { contacts } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

export const contactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(contacts).orderBy(contacts.createdAt)
    );
    return reply.send({ ok: true, data: rows.map(toView) });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx.select().from(contacts).where(eq(contacts.id, request.params.id)).limit(1)
    );
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Contact not found" } });
    }
    return reply.send({ ok: true, data: toView(row) });
  });

  fastify.post<{
    Body: { accountId?: string; name?: string; email?: string; phone?: string; role?: string };
  }>("/", async (request, reply) => {
    const { accountId, name, email, phone, role } = request.body ?? {};
    if (!accountId || !name) {
      return reply.status(400).send({
        ok: false,
        error: { code: "bad_request", message: "accountId and name are required" }
      });
    }
    const [row] = await request.server.scopedDb.transaction((tx) =>
      tx
        .insert(contacts)
        .values({
          id: randomUUID(),
          tenantId: request.tenantId,
          accountId,
          name,
          email,
          phone,
          role
        })
        .returning()
    );
    return reply.status(201).send({ ok: true, data: toView(row!) });
  });
};

function toView(row: typeof contacts.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    accountId: row.accountId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
