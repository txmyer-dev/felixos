import { eq } from "drizzle-orm";

import { runWithTenantContext, tenantN8nSkills } from "@felixos/db";
import type { ScopedDatabaseClient } from "@felixos/db";
import type { N8nClient } from "@felixos/integrations";
import type { Skill } from "@felixos/skills";

import { createN8nWorkflowSkill, resolveWorkflowName } from "./n8n-workflow.js";

export async function createN8nWorkflowSkills(opts: {
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  n8nClient: N8nClient;
  fetchImpl?: typeof fetch | undefined;
}): Promise<Skill<unknown, unknown>[]> {
  const rows = await runWithTenantContext(opts.tenantId, () =>
    opts.scopedDb.transaction((tx) =>
      tx.select().from(tenantN8nSkills).where(eq(tenantN8nSkills.tenantId, opts.tenantId))
    )
  );

  return Promise.all(
    rows.map(async (row) => {
      const workflowName = await resolveWorkflowName(opts.n8nClient, row.n8nWorkflowId);
      const skillOpts =
        opts.fetchImpl === undefined
          ? { row, workflowName }
          : { row, workflowName, fetchImpl: opts.fetchImpl };
      return createN8nWorkflowSkill(skillOpts) as Skill<unknown, unknown>;
    })
  );
}
