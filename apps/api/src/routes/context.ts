import { runWithTenantContext } from "@felixos/db";
import type { FastifyRequest } from "fastify";

export function withRequestTenant<T>(
  request: FastifyRequest,
  callback: () => T | Promise<T>
): T | Promise<T> {
  return runWithTenantContext(request.tenantId, callback);
}
