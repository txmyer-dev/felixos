import { AsyncLocalStorage } from "node:async_hooks";

export type TenantId = string;

export type TenantDatabaseContext = {
  tenantId: TenantId;
};

const tenantContext = new AsyncLocalStorage<TenantDatabaseContext>();

export function runWithTenantContext<T>(
  tenantId: TenantId,
  callback: () => T | Promise<T>
): T | Promise<T> {
  return tenantContext.run({ tenantId }, callback);
}

export function getTenantContext(): TenantDatabaseContext | undefined {
  return tenantContext.getStore();
}

export function requireTenantId(): TenantId {
  const context = getTenantContext();

  if (!context) {
    throw new Error("Tenant database context is required");
  }

  return context.tenantId;
}
