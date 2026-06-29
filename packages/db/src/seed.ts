import { eq } from "drizzle-orm";

import type { PrivilegedDatabaseClient } from "./client.js";
import { contacts, deals, entities, interactions, tenants } from "./schema/index.js";
import {
  demoAccounts,
  demoContacts,
  demoDeals,
  demoInteractions,
  demoTenant
} from "./seed-data/demo.js";

export async function seedDemoTenant(client: PrivilegedDatabaseClient): Promise<string> {
  await client.db.transaction(async (tx) => {
    await tx
      .insert(tenants)
      .values(demoTenant)
      .onConflictDoUpdate({
        target: tenants.slug,
        set: {
          name: demoTenant.name,
          status: demoTenant.status,
          isDemo: demoTenant.isDemo,
          updatedAt: new Date()
        }
      });

    await tx
      .insert(entities)
      .values(
        demoAccounts.map((account) => ({
          ...account,
          tenantId: demoTenant.id
        }))
      )
      .onConflictDoNothing();

    await tx
      .insert(contacts)
      .values(
        demoContacts.map((contact) => ({
          ...contact,
          tenantId: demoTenant.id
        }))
      )
      .onConflictDoNothing();

    await tx
      .insert(deals)
      .values(
        demoDeals.map((deal) => ({
          ...deal,
          tenantId: demoTenant.id
        }))
      )
      .onConflictDoNothing();

    await tx
      .insert(interactions)
      .values(
        demoInteractions.map((interaction) => ({
          ...interaction,
          tenantId: demoTenant.id
        }))
      )
      .onConflictDoNothing();
  });

  return demoTenant.id;
}

export async function isDemoTenantDormant(
  client: PrivilegedDatabaseClient,
  tenantSlug = demoTenant.slug
): Promise<boolean> {
  const [tenant] = await client.db
    .select({ status: tenants.status, isDemo: tenants.isDemo })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  return tenant?.isDemo === true && tenant.status === "dormant";
}
