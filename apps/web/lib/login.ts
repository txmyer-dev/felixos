export type LoginPayload = {
  tenantSlug: string;
  code?: string;
  recoveryCode?: string;
};

export function buildLoginPayload(formData: FormData): LoginPayload {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const recoveryCode = String(formData.get("recoveryCode") ?? "").trim();

  return {
    tenantSlug,
    ...(recoveryCode ? { recoveryCode } : { code })
  };
}
