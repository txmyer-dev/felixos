import { describe, expect, test } from "vitest";

import { resolveTenantSlug } from "./tenant";

describe("tenant slug resolution", () => {
  test("resolves tenant slugs from subdomains", () => {
    expect(resolveTenantSlug("acme.felixos.test")).toBe("acme");
  });

  test("falls back to the default tenant slug on localhost, regardless of path", () => {
    expect(resolveTenantSlug("localhost:3000")).toBe("demo");
  });

  test("falls back to the default tenant slug for excluded hosts", () => {
    expect(resolveTenantSlug("www.felixos.test")).toBe("demo");
    expect(resolveTenantSlug("felixos.test")).toBe("demo");
  });
});
