import { createPrivilegedDatabaseClient } from "@felixos/db";
import { readTotpEncryptionKey, provisionTenant } from "@felixos/auth";

export async function provisionTenantFromCli(argv = process.argv): Promise<void> {
  const tenantSlug = readFlag(argv, "--tenant");
  const tenantName = readFlag(argv, "--name");
  
  const databaseUrl = process.env.DATABASE_PRIVILEGED_URL || process.env.PRIVILEGED_DATABASE_URL;
  const keyId = process.env.TOTP_SECRET_KEY_ID ?? "local";
  const encryptionKey = readTotpEncryptionKey(process.env.TOTP_SECRET_ENCRYPTION_KEY);

  if (!tenantSlug || !tenantName) {
    throw new Error("Usage: felixos-cli provision --tenant <tenant-slug> --name <tenant-name>");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_PRIVILEGED_URL is required");
  }

  const client = createPrivilegedDatabaseClient(databaseUrl);

  try {
    const enrollment = await provisionTenant(client, {
      slug: tenantSlug,
      name: tenantName,
      encryptionKey,
      keyId,
    });

    process.stdout.write(`${JSON.stringify(enrollment, null, 2)}\n`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") { // Postgres unique violation
      throw new Error(`Tenant '${tenantSlug}' already exists.`, { cause: err });
    }
    throw err;
  } finally {
    await client.end();
  }
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
