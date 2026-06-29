import type { NextRequest } from "next/server";

export const tenantSlugHeader = "x-felixos-tenant-slug";

export function resolveTenantSlug(host: string, pathname: string): string {
  const normalizedHost = host.split(":")[0]?.toLowerCase() ?? "";
  const subdomain = normalizedHost.split(".")[0];
  const pathSlug = pathname.split("/").filter(Boolean)[0];

  if (subdomain && !["localhost", "127", "www", "felixos"].includes(subdomain)) {
    return subdomain;
  }

  return pathSlug ?? "demo";
}

export function requestTenantSlug(request: NextRequest): string {
  return resolveTenantSlug(request.headers.get("host") ?? "", request.nextUrl.pathname);
}
