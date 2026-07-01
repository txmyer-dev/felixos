import { describe, expect, it } from "vitest";

import { isPublicPath } from "./proxy-rules";

describe("isPublicPath", () => {
  it("allows login, login API, and static assets", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("protects app routes by default", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/accounts")).toBe(false);
    expect(isPublicPath("/knowledge")).toBe(false);
  });
});
