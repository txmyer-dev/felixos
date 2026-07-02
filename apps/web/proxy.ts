import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath } from "./lib/proxy-rules";
import { requestTenantSlug, tenantSlugHeader } from "./lib/tenant";

const sessionCookieName = "felixos_session";

export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(tenantSlugHeader, requestTenantSlug(request));

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  if (!request.cookies.has(sessionCookieName)) {
    const loginUrl = new URL("/login", request.url);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) loginUrl.host = host;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
