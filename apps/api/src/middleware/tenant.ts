import { runWithTenantContext } from "@felixos/db";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export const tenantMiddleware: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook("onRequest", (request, _reply, done) => {
    if (!request.tenantId) {
      done();
      return;
    }
    // Wrap done() in ALS so subsequent hooks and handlers inherit tenant context
    runWithTenantContext(request.tenantId, done as () => void);
  });
});
