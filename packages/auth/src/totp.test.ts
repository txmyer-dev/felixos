import { randomBytes } from "node:crypto";

import { describe, expect, test } from "vitest";

import { generateRecoveryCodes, verifyRecoveryCode } from "./recovery.js";
import { createSession, serializeSessionCookie } from "./session.js";
import {
  decryptSecret,
  decryptTotpSecret,
  encryptSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  hashTotpCode,
  verifyTotpCode
} from "./totp.js";

describe("passwordless auth primitives", () => {
  test("validates current and adjacent TOTP windows while rejecting outside skew", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-06-29T12:00:00.000Z");
    const currentCode = generateTotpCode(secret, { now });
    const adjacentCode = generateTotpCode(secret, { now: new Date(now.getTime() - 30_000) });
    const oldCode = generateTotpCode(secret, { now: new Date(now.getTime() - 90_000) });

    expect(verifyTotpCode(secret, currentCode, { now })).toMatchObject({ valid: true });
    expect(verifyTotpCode(secret, adjacentCode, { now })).toMatchObject({ valid: true });
    expect(verifyTotpCode(secret, oldCode, { now })).toEqual({ valid: false });
  });

  test("binds replay hashes to the tenant and TOTP time step", () => {
    const code = "123456";

    expect(hashTotpCode("tenant-a", code, 1)).toBe(hashTotpCode("tenant-a", code, 1));
    expect(hashTotpCode("tenant-a", code, 1)).not.toBe(hashTotpCode("tenant-b", code, 1));
    expect(hashTotpCode("tenant-a", code, 1)).not.toBe(hashTotpCode("tenant-a", code, 2));
  });

  test("does not validate one tenant secret with another tenant secret", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const tenantASecret = generateTotpSecret();
    const tenantBSecret = generateTotpSecret();
    const tenantACode = generateTotpCode(tenantASecret, { now });

    expect(verifyTotpCode(tenantBSecret, tenantACode, { now })).toEqual({ valid: false });
  });

  test("encrypts TOTP secrets for storage and decrypts with the app key", () => {
    const key = randomBytes(32);
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, key, "local-test");

    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, key)).toBe(secret);
  });

  test("encrypts generic secrets for non-TOTP credentials", () => {
    const key = randomBytes(32);
    const secret = "provider-api-key";
    const encrypted = encryptSecret(secret, key, "local-test");

    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptSecret(encrypted, key)).toBe(secret);
  });

  test("generates high-entropy single-use recovery code hashes", () => {
    const [generated] = generateRecoveryCodes("tenant-a", { count: 1 });

    expect(generated?.code.replaceAll("-", "")).toHaveLength(32);
    expect(verifyRecoveryCode("tenant-a", generated?.code ?? "", generated?.codeHash ?? "")).toBe(
      true
    );
    expect(verifyRecoveryCode("tenant-b", generated?.code ?? "", generated?.codeHash ?? "")).toBe(
      false
    );
  });

  test("regenerates session ids and emits hardened cookie flags", () => {
    const first = createSession("tenant-a", { now: new Date("2026-06-29T12:00:00.000Z") });
    const second = createSession("tenant-a", { now: new Date("2026-06-29T12:00:00.000Z") });
    const cookie = serializeSessionCookie(first.token);

    expect(first.id).not.toBe(second.id);
    expect(first.sessionHash).not.toBe(first.token);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });
});
