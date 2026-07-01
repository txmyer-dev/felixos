import type { NextRequest } from "next/server";

export const tenantSlugHeader = "x-felixos-tenant-slug";

// App routes are flat (/login, /accounts, ...) with no tenant-prefixed path
// segment anywhere, so there is no path value to fall back to here. Below the
// subdomain layer, every host (localhost, CI, non-wildcard deployments) is a
// single-tenant deployment of FELIXOS_DEFAULT_TENANT_SLUG.
export function resolveTenantSlug(host: string): string {
  const normalizedHost = host.split(":")[0]?.toLowerCase() ?? "";
  const subdomain = normalizedHost.split(".")[0];

  if (subdomain && !["localhost", "127", "www", "felixos"].includes(subdomain)) {
    return subdomain;
  }

  return process.env.FELIXOS_DEFAULT_TENANT_SLUG ?? "demo";
}

export function requestTenantSlug(request: NextRequest): string {
  return resolveTenantSlug(request.headers.get("host") ?? "");
}
