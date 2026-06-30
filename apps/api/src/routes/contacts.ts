import { contacts } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendCreated, sendNotFound, sendSuccess } from "../lib/responses.js";
import { withRequestTenant } from "./context.js";

export const contactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(contacts).orderBy(contacts.createdAt)
      )
    );
    return sendSuccess(reply, rows.map(toView));
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(contacts).where(eq(contacts.id, request.params.id)).limit(1)
      )
    );
    if (!row) {
      return sendNotFound(reply, "Contact not found");
    }
    return sendSuccess(reply, toView(row));
  });

  fastify.post<{
    Body: { accountId?: string; name?: string; email?: string; phone?: string; role?: string };
  }>("/", async (request, reply) => {
    const { accountId, name, email, phone, role } = request.body ?? {};
    if (!accountId || !name) {
      return sendBadRequest(reply, "accountId and name are required");
    }
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
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
      )
    );
    return sendCreated(reply, toView(row!));
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
