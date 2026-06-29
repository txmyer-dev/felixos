import type { TenantId } from "./tenant.js";

export type SessionId = string;

export type AuthCodeKind = "totp" | "recovery_code";

export type TotpLoginRequest = {
  tenantSlug: string;
  code: string;
};

export type RecoveryCodeLoginRequest = {
  tenantSlug: string;
  recoveryCode: string;
};

export type LoginRequest = TotpLoginRequest | RecoveryCodeLoginRequest;

export type AuthenticatedSession = {
  id: SessionId;
  tenantId: TenantId;
  createdAt: string;
  expiresAt: string;
};

export type SessionPayload = {
  sessionId: SessionId;
  tenantId: TenantId;
};

export type LoginResponse = {
  session: AuthenticatedSession;
  codeKind: AuthCodeKind;
};

export type RecoveryCode = {
  code: string;
};

export type TenantEnrollment = {
  tenantId: TenantId;
  tenantSlug: string;
  totpSecret: string;
  recoveryCodes: RecoveryCode[];
};
