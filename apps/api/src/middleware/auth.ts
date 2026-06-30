import { sessionCookieName, validateSession } from "@felixos/auth";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    sessionId: string;
  }
}

const UNPROTECTED_PATHS = new Set(["/health", "/auth/login"]);

export const authMiddleware: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split("?")[0] ?? request.url;
    if (UNPROTECTED_PATHS.has(pathname)) return;

    const token = extractSessionToken(request);
    if (!token) {
      return sendUnauthorized(reply);
    }

    const payload = await validateSession(request.server.privilegedDb, token);
    if (!payload) {
      return sendUnauthorized(reply);
    }

    request.tenantId = payload.tenantId;
    request.sessionId = payload.sessionId;
  });
});

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply
    .status(401)
    .send({ ok: false, error: { code: "unauthorized", message: "Authentication required" } });
}

function extractSessionToken(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name?.trim() === sessionCookieName && rest.length > 0) {
        return rest.join("=");
      }
    }
  }
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}
