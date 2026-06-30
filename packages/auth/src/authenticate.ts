import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { ScopedDatabaseClient } from "@felixos/db";
import { recoveryCodes, sessions, tenantTotpSecrets, totpReplayGuards } from "@felixos/db";
import { runWithTenantContext } from "@felixos/db";

import { hashRecoveryCode, verifyRecoveryCode } from "./recovery.js";
import { createSession } from "./session.js";
import { decryptTotpSecret, hashTotpCode, type EncryptedSecret, verifyTotpCode } from "./totp.js";

export type AuthResult = {
  session: ReturnType<typeof createSession>;
  codeKind: "totp" | "recovery_code";
};

export async function authenticateTotp(
  client: ScopedDatabaseClient,
  input: { tenantId: string; code: string; encryptionKey: Buffer; now?: Date }
): Promise<AuthResult> {
  return runWithTenantContext(input.tenantId, () =>
    client.transaction(async (tx) => {
      const [secretRow] = await tx
        .select()
        .from(tenantTotpSecrets)
        .where(eq(tenantTotpSecrets.tenantId, input.tenantId))
        .limit(1);

      if (!secretRow) {
        throw new Error("Invalid authentication code");
      }

      const secret = decryptTotpSecret(secretRow satisfies EncryptedSecret, input.encryptionKey);
      const verification = verifyTotpCode(secret, input.code, input.now ? { now: input.now } : {});

      if (!verification.valid || verification.timeStep === undefined) {
        throw new Error("Invalid authentication code");
      }

      const codeHash = hashTotpCode(input.tenantId, input.code, verification.timeStep);

      try {
        await tx.insert(totpReplayGuards).values({
          id: randomUUID(),
          tenantId: input.tenantId,
          codeHash,
          timeStep: verification.timeStep
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error("Authentication code has already been used", { cause: error });
        }
        throw error;
      }

      const session = createSession(input.tenantId, input.now ? { now: input.now } : {});
      await tx.insert(sessions).values({
        id: session.id,
        tenantId: input.tenantId,
        sessionHash: session.sessionHash,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      });

      return { session, codeKind: "totp" };
    })
  );
}

export async function authenticateRecoveryCode(
  client: ScopedDatabaseClient,
  input: { tenantId: string; recoveryCode: string; now?: Date }
): Promise<AuthResult> {
  return runWithTenantContext(input.tenantId, () =>
    client.transaction(async (tx) => {
      const codeHash = hashRecoveryCode(input.tenantId, input.recoveryCode);
      const [consumedCode] = await tx
        .update(recoveryCodes)
        .set({ consumedAt: input.now ?? new Date() })
        .where(
          and(
            eq(recoveryCodes.tenantId, input.tenantId),
            eq(recoveryCodes.codeHash, codeHash),
            isNull(recoveryCodes.consumedAt)
          )
        )
        .returning({ codeHash: recoveryCodes.codeHash });

      if (
        !consumedCode ||
        !verifyRecoveryCode(input.tenantId, input.recoveryCode, consumedCode.codeHash)
      ) {
        throw new Error("Invalid recovery code");
      }

      const session = createSession(input.tenantId, input.now ? { now: input.now } : {});
      await tx.insert(sessions).values({
        id: session.id,
        tenantId: input.tenantId,
        sessionHash: session.sessionHash,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      });

      return { session, codeKind: "recovery_code" };
    })
  );
}

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code: string }).code === PG_UNIQUE_VIOLATION
  );
}
