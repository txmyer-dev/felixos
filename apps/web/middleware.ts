import { NextResponse, type NextRequest } from "next/server";

import { requestTenantSlug, tenantSlugHeader } from "./lib/tenant";

export function middleware(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(tenantSlugHeader, requestTenantSlug(request));

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
