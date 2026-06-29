import "server-only";

import { cookies, headers } from "next/headers";

import type { Account, ApiResult, LoginResponse } from "@felixos/shared-types";

export async function login(input: {
  tenantSlug: string;
  code?: string;
  recoveryCode?: string;
}): Promise<ApiResult<LoginResponse>> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  return response.json() as Promise<ApiResult<LoginResponse>>;
}

export async function fetchAccounts(): Promise<Account[]> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const response = await fetch(`${protocol}://${host}/api/entities`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const result = (await response.json()) as ApiResult<Account[]>;
  return result.ok ? result.data : [];
}
