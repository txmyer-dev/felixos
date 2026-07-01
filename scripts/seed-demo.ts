import {
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  readTotpEncryptionKey
} from "@felixos/auth";
import {
  createPrivilegedDatabaseClient,
  recoveryCodes,
  seedDemoTenant,
  tenantTotpSecrets,
  tenants
} from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { demoTenant } from "../packages/db/src/seed-data/demo.js";

const databaseUrl = process.env.DATABASE_PRIVILEGED_URL ?? process.env.DATABASE_URL;
const rawKey = process.env.TOTP_SECRET_ENCRYPTION_KEY;
const keyId = process.env.TOTP_SECRET_KEY_ID ?? "default";
const demoTotpSecret = process.env.FELIXOS_DEMO_TOTP_SECRET ?? generateTotpSecret();

if (!databaseUrl) {
  throw new Error("DATABASE_PRIVILEGED_URL or DATABASE_URL is required");
}

const db = createPrivilegedDatabaseClient(databaseUrl);

try {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  await seedDemoTenant(db);
  await ensureDemoLoginSecret(encryptionKey);
  console.log(`Seeded demo tenant: ${demoTenant.slug}`);
  console.log(`Demo TOTP secret: ${demoTotpSecret}`);
} finally {
  await db.end();
}

async function ensureDemoLoginSecret(encryptionKey: Buffer): Promise<void> {
  const encryptedSecret = encryptTotpSecret(demoTotpSecret, encryptionKey, keyId);
  const generatedRecoveryCodes = generateRecoveryCodes(demoTenant.id);

  await db.db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(tenants.id, demoTenant.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.tenantId, demoTenant.id));
    await tx.delete(tenantTotpSecrets).where(eq(tenantTotpSecrets.tenantId, demoTenant.id));
    await tx.insert(tenantTotpSecrets).values({ tenantId: demoTenant.id, ...encryptedSecret });
    await tx.insert(recoveryCodes).values(
      generatedRecoveryCodes.map((code) => ({
        id: randomUUID(),
        tenantId: demoTenant.id,
        codeHash: code.codeHash
      }))
    );
  });
}
