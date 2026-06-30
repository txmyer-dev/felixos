import { pendingActions, tenantSkillRungs, type ScopedDatabaseClient } from "@felixos/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { runWithTenantContext } from "@felixos/db";

import type { TrustRung } from "@felixos/shared-types";
import type { TrustLadderStore } from "./trust-ladder.js";

export function createDbTrustLadderStore(opts: {
  scopedDb: ScopedDatabaseClient;
  tenantId: string;
}): TrustLadderStore {
  return {
    async getRungOverride(tenantId, skillName) {
      const [row] = await runWithTenantContext(tenantId, () =>
        opts.scopedDb.transaction((tx) =>
          tx
            .select({ rung: tenantSkillRungs.rung })
            .from(tenantSkillRungs)
            .where(
              and(
                eq(tenantSkillRungs.tenantId, tenantId),
                eq(tenantSkillRungs.skillName, skillName)
              )
            )
            .limit(1)
        )
      );
      return row?.rung as TrustRung | undefined;
    },

    async insertPendingAction(row) {
      const id = randomUUID();
      await runWithTenantContext(opts.tenantId, () =>
        opts.scopedDb.transaction((tx) =>
          tx.insert(pendingActions).values({
            id,
            tenantId: row.tenantId,
            skillName: row.skillName,
            payload: row.payload as Record<string, unknown>,
            status: row.status,
            ...(row.result !== undefined
              ? { agentContext: JSON.stringify(row.result) }
              : {})
          })
        )
      );
      return id;
    }
  };
}
