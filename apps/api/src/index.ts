import { readTotpEncryptionKey } from "@felixos/auth";
import { buildServer } from "./server.js";

const server = buildServer({
  databaseUrl: process.env.DATABASE_URL ?? "",
  privilegedDatabaseUrl: process.env.DATABASE_PRIVILEGED_URL ?? "",
  encryptionKey: readTotpEncryptionKey(process.env.TOTP_SECRET_ENCRYPTION_KEY),
  keyId: process.env.TOTP_SECRET_KEY_ID ?? "default",
  logger: process.env.NODE_ENV !== "test"
});

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

server.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`FelixOS API running at ${address}`);
});
