import { createPrivilegedDatabaseClient } from "@felixos/db";
import { readTotpEncryptionKey, reissueTenantEnrollment } from "@felixos/auth";

export async function reissueTenantSecretFromCli(argv = process.argv): Promise<void> {
  const tenantSlug = readFlag(argv, "--tenant");
  const databaseUrl = process.env.PRIVILEGED_DATABASE_URL;
  const keyId = process.env.TOTP_SECRET_KEY_ID ?? "local";
  const encryptionKey = readTotpEncryptionKey(process.env.TOTP_SECRET_ENCRYPTION_KEY);

  if (!tenantSlug) {
    throw new Error("Usage: felixos-cli reissue --tenant <tenant-slug>");
  }

  if (!databaseUrl) {
    throw new Error("PRIVILEGED_DATABASE_URL is required");
  }

  const client = createPrivilegedDatabaseClient(databaseUrl);

  try {
    const enrollment = await reissueTenantEnrollment(client, {
      tenantSlug,
      encryptionKey,
      keyId
    });

    process.stdout.write(`${JSON.stringify(enrollment, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
