import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import type { PrivilegedDatabaseClient } from "@felixos/db";
import { sessions } from "@felixos/db";
import type { SessionPayload } from "@felixos/shared-types";

export const sessionCookieName = "felixos_session";

export type CreatedSession = {
  id: string;
  token: string;
  sessionHash: string;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
};

export function createSession(
  tenantId: string,
  options: { now?: Date; ttlSeconds?: number } = {}
): CreatedSession {
  const createdAt = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 8;
  const token = randomBytes(32).toString("base64url");

  return {
    id: randomUUID(),
    token,
    sessionHash: hashSessionToken(token),
    tenantId,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + ttlSeconds * 1000)
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function validateSession(
  privilegedDb: PrivilegedDatabaseClient,
  sessionToken: string
): Promise<SessionPayload | null> {
  const hash = hashSessionToken(sessionToken);
  const [row] = await privilegedDb.db
    .select({ id: sessions.id, tenantId: sessions.tenantId })
    .from(sessions)
    .where(
      and(
        eq(sessions.sessionHash, hash),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt)
      )
    )
    .limit(1);
  return row ? { sessionId: row.id, tenantId: row.tenantId } : null;
}

export function serializeSessionCookie(
  token: string,
  options: { maxAgeSeconds?: number; secure?: boolean } = {}
): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? 60 * 60 * 8;
  const secure = options.secure ?? true;
  const parts = [
    `${sessionCookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
