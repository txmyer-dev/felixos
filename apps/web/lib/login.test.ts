import { describe, expect, test } from "vitest";

import { buildLoginPayload } from "./login";

describe("login payloads", () => {
  test("submits TOTP codes for passwordless login", () => {
    const formData = new FormData();
    formData.set("tenantSlug", "acme");
    formData.set("code", " 123456 ");

    expect(buildLoginPayload(formData)).toEqual({
      tenantSlug: "acme",
      code: "123456"
    });
  });

  test("submits recovery codes through the recovery path", () => {
    const formData = new FormData();
    formData.set("tenantSlug", "acme");
    formData.set("code", "123456");
    formData.set("recoveryCode", " abcd-efgh ");

    expect(buildLoginPayload(formData)).toEqual({
      tenantSlug: "acme",
      recoveryCode: "abcd-efgh"
    });
  });
});
