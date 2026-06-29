import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const defaultStepSeconds = 30;
const defaultDigits = 6;
const defaultSkew = 1;

export type EncryptedSecret = {
  ciphertext: string;
  nonce: string;
  keyId: string;
};

export type TotpVerification = {
  valid: boolean;
  timeStep?: number;
};

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(randomBytes(byteLength));
}

export function generateTotpCode(
  secret: string,
  options: { now?: Date; stepSeconds?: number; digits?: number } = {}
): string {
  const stepSeconds = options.stepSeconds ?? defaultStepSeconds;
  const digits = options.digits ?? defaultDigits;
  const counter = Math.floor((options.now?.getTime() ?? Date.now()) / 1000 / stepSeconds);

  return generateHotp(secret, counter, digits);
}

export function verifyTotpCode(
  secret: string,
  code: string,
  options: { now?: Date; stepSeconds?: number; digits?: number; skew?: number } = {}
): TotpVerification {
  const normalizedCode = code.trim();
  const stepSeconds = options.stepSeconds ?? defaultStepSeconds;
  const digits = options.digits ?? defaultDigits;
  const skew = options.skew ?? defaultSkew;
  const currentStep = Math.floor((options.now?.getTime() ?? Date.now()) / 1000 / stepSeconds);

  if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) {
    return { valid: false };
  }

  for (let offset = -skew; offset <= skew; offset += 1) {
    const timeStep = currentStep + offset;
    const expected = generateHotp(secret, timeStep, digits);

    if (safeEqual(normalizedCode, expected)) {
      return { valid: true, timeStep };
    }
  }

  return { valid: false };
}

export function hashTotpCode(tenantId: string, code: string, timeStep: number): string {
  return createHmac("sha256", tenantId).update(`${timeStep}:${code.trim()}`).digest("base64url");
}

export function encryptTotpSecret(secret: string, key: Buffer, keyId: string): EncryptedSecret {
  assertEncryptionKey(key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([ciphertext, tag]).toString("base64url"),
    nonce: nonce.toString("base64url"),
    keyId
  };
}

export function decryptTotpSecret(encrypted: EncryptedSecret, key: Buffer): string {
  assertEncryptionKey(key);
  const payload = Buffer.from(encrypted.ciphertext, "base64url");
  const nonce = Buffer.from(encrypted.nonce, "base64url");
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function readTotpEncryptionKey(encodedKey: string | undefined): Buffer {
  if (!encodedKey) {
    throw new Error("TOTP_SECRET_ENCRYPTION_KEY is required");
  }

  const key = Buffer.from(encodedKey, "hex");
  assertEncryptionKey(key);
  return key;
}

function generateHotp(secret: string, counter: number, digits: number): string {
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** digits).padStart(digits, "0");
}

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(input: string): Buffer {
  const normalized = input.replaceAll("=", "").replaceAll(/\s/gu, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);

    if (index === -1) {
      throw new Error("Invalid TOTP secret encoding");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function assertEncryptionKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error("TOTP encryption key must be 32 bytes");
  }
}
