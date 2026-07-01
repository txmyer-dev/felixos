const publicExactPaths = new Set(["/login", "/api/auth/login", "/favicon.ico"]);
const publicPrefixes = ["/_next/", "/public/"];

export function isPublicPath(pathname: string): boolean {
  if (publicExactPaths.has(pathname)) return true;
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}
