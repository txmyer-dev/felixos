import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { PrivilegedDatabaseClient } from "@felixos/db";
import { recoveryCodes, tenantTotpSecrets, tenants } from "@felixos/db";
import type { TenantEnrollment } from "@felixos/shared-types";

import { generateRecoveryCodes } from "./recovery.js";
import { encryptTotpSecret, generateTotpSecret } from "./totp.js";

export type ProvisionTenantInput = {
  slug: string;
  name: string;
  encryptionKey: Buffer;
  keyId: string;
  tenantId?: string;
  isDemo?: boolean;
  status?: "active" | "dormant";
};

export async function provisionTenant(
  client: PrivilegedDatabaseClient,
  input: ProvisionTenantInput
): Promise<TenantEnrollment> {
  const tenantId = input.tenantId ?? randomUUID();
  const totpSecret = generateTotpSecret();
  const encryptedSecret = encryptTotpSecret(totpSecret, input.encryptionKey, input.keyId);
  const generatedRecoveryCodes = generateRecoveryCodes(tenantId);

  await client.db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId,
      slug: input.slug,
      name: input.name,
      isDemo: input.isDemo ?? false,
      status: input.status ?? "active"
    });
    await tx.insert(tenantTotpSecrets).values({ tenantId, ...encryptedSecret });
    await tx.insert(recoveryCodes).values(
      generatedRecoveryCodes.map((code) => ({
        id: randomUUID(),
        tenantId,
        codeHash: code.codeHash
      }))
    );
  });

  return {
    tenantId,
    tenantSlug: input.slug,
    totpSecret,
    recoveryCodes: generatedRecoveryCodes.map(({ code }) => ({ code }))
  };
}

export async function reissueTenantEnrollment(
  client: PrivilegedDatabaseClient,
  input: { tenantSlug: string; encryptionKey: Buffer; keyId: string }
): Promise<TenantEnrollment> {
  const [tenant] = await client.db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, input.tenantSlug))
    .limit(1);

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const totpSecret = generateTotpSecret();
  const encryptedSecret = encryptTotpSecret(totpSecret, input.encryptionKey, input.keyId);
  const generatedRecoveryCodes = generateRecoveryCodes(tenant.id);

  await client.db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.tenantId, tenant.id));
    await tx.delete(tenantTotpSecrets).where(eq(tenantTotpSecrets.tenantId, tenant.id));
    await tx.insert(tenantTotpSecrets).values({ tenantId: tenant.id, ...encryptedSecret });
    await tx.insert(recoveryCodes).values(
      generatedRecoveryCodes.map((code) => ({
        id: randomUUID(),
        tenantId: tenant.id,
        codeHash: code.codeHash
      }))
    );
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    totpSecret,
    recoveryCodes: generatedRecoveryCodes.map(({ code }) => ({ code }))
  };
}
