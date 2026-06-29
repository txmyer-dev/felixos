import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type GeneratedRecoveryCode = {
  code: string;
  codeHash: string;
};

export function generateRecoveryCodes(
  tenantId: string,
  options: { count?: number; byteLength?: number } = {}
): GeneratedRecoveryCode[] {
  const count = options.count ?? 10;
  const byteLength = options.byteLength ?? 16;

  return Array.from({ length: count }, () => {
    const code = formatRecoveryCode(randomBytes(byteLength).toString("hex"));
    return { code, codeHash: hashRecoveryCode(tenantId, code) };
  });
}

export function hashRecoveryCode(tenantId: string, code: string): string {
  return createHash("sha256")
    .update(`${tenantId}:${normalizeRecoveryCode(code)}`)
    .digest("base64url");
}

export function verifyRecoveryCode(tenantId: string, code: string, expectedHash: string): boolean {
  const codeHash = hashRecoveryCode(tenantId, code);
  const codeHashBuffer = Buffer.from(codeHash);
  const expectedHashBuffer = Buffer.from(expectedHash);

  return (
    codeHashBuffer.length === expectedHashBuffer.length &&
    timingSafeEqual(codeHashBuffer, expectedHashBuffer)
  );
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().replaceAll("-", "").toUpperCase();
}

function formatRecoveryCode(code: string): string {
  return (
    code
      .replaceAll(/[^a-zA-Z0-9]/gu, "")
      .toUpperCase()
      .match(/.{1,4}/gu)
      ?.join("-") ?? code
  );
}
