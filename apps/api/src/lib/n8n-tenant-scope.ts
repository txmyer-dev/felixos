import { tenantN8nSkills } from "@felixos/db";

import type { ScopedDatabaseClient } from "@felixos/db";

export async function getTenantN8nWorkflowIds(
  scopedDb: ScopedDatabaseClient
): Promise<Set<string>> {
  const registrations = await scopedDb.transaction((tx) =>
    tx.select({ n8nWorkflowId: tenantN8nSkills.n8nWorkflowId }).from(tenantN8nSkills)
  );

  return new Set(registrations.map((row) => row.n8nWorkflowId));
}
