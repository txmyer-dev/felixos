import { createHash, randomBytes, randomUUID } from "node:crypto";

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
