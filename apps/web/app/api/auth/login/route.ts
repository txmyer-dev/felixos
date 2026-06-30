import { NextResponse, type NextRequest } from "next/server";

import { buildLoginPayload } from "../../../../lib/login";

const apiOrigin = process.env.FELIXOS_API_ORIGIN ?? "http://localhost:3001";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();

  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildLoginPayload(formData)),
      cache: "no-store"
    });
  } catch {
    return NextResponse.redirect(new URL("/login?error=unavailable", request.url), 303);
  }

  if (!response.ok) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  const redirect = NextResponse.redirect(new URL("/", request.url), 303);
  const setCookie = response.headers.get("set-cookie");

  if (setCookie) {
    redirect.headers.set("set-cookie", setCookie);
  }

  return redirect;
}
