import { sessionCookieName, validateSession } from "@felixos/auth";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { sendUnauthorized } from "../lib/responses.js";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    sessionId: string;
  }
}

const UNPROTECTED_PATHS = new Set(["/health", "/auth/login"]);

export const authMiddleware: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (UNPROTECTED_PATHS.has(request.url)) return;

    const token = extractSessionToken(request);
    if (!token) {
      return sendUnauthorized(reply, "Authentication required");
    }

    const payload = await validateSession(request.server.privilegedDb, token);
    if (!payload) {
      return sendUnauthorized(reply, "Authentication required");
    }

    request.tenantId = payload.tenantId;
    request.sessionId = payload.sessionId;
  });
});

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
