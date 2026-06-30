import { authenticateRecoveryCode, authenticateTotp, serializeSessionCookie } from "@felixos/auth";
import { tenants } from "@felixos/db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendUnauthorized } from "../lib/responses.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { tenantSlug?: string; code?: string; recoveryCode?: string };
  }>(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.ip
        }
      }
    },
    async (request, reply) => {
      const { tenantSlug, code, recoveryCode } = request.body ?? {};

      if (!tenantSlug) {
        return sendBadRequest(reply, "tenantSlug is required");
      }

      const [tenant] = await request.server.privilegedDb.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        return sendUnauthorized(reply, "Authentication failed");
      }

      try {
        if (recoveryCode) {
          const result = await authenticateRecoveryCode(request.server.scopedDb, {
            tenantId: tenant.id,
            recoveryCode
          });
          return reply
            .header("set-cookie", serializeSessionCookie(result.session.token))
            .status(200)
            .send({ ok: true, data: toSessionView(result) });
        }

        if (!code) {
          return sendBadRequest(reply, "code or recoveryCode is required");
        }

        const result = await authenticateTotp(request.server.scopedDb, {
          tenantId: tenant.id,
          code,
          encryptionKey: request.server.encryptionKey
        });

        return reply
          .header("set-cookie", serializeSessionCookie(result.session.token))
          .status(200)
          .send({ ok: true, data: toSessionView(result) });
      } catch (error) {
        if (error instanceof Error && isAuthenticationError(error)) {
          return sendUnauthorized(reply, "Authentication failed");
        }
        throw error;
      }
    }
  );
};

const authErrorMessages = new Set([
  "Invalid authentication code",
  "Authentication code has already been used",
  "Invalid recovery code"
]);

function isAuthenticationError(error: Error): boolean {
  return authErrorMessages.has(error.message);
}

function toSessionView(result: {
  session: { id: string; tenantId: string; createdAt: Date; expiresAt: Date };
  codeKind: string;
}) {
  return {
    session: {
      id: result.session.id,
      tenantId: result.session.tenantId,
      createdAt: result.session.createdAt.toISOString(),
      expiresAt: result.session.expiresAt.toISOString()
    },
    codeKind: result.codeKind
  };
}
