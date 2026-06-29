import { describe, expect, test } from "vitest";

import { resolveTenantSlug } from "./tenant";

describe("tenant slug resolution", () => {
  test("resolves tenant slugs from subdomains", () => {
    expect(resolveTenantSlug("acme.felixos.test", "/login")).toBe("acme");
  });

  test("falls back to the first path segment on localhost", () => {
    expect(resolveTenantSlug("localhost:3000", "/demo/login")).toBe("demo");
  });

  test("uses the same fallback for unknown pre-auth tenants", () => {
    expect(resolveTenantSlug("localhost:3000", "/missing/login")).toBe("missing");
  });
});
