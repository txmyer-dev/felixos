import "server-only";

import { cookies, headers } from "next/headers";

import type { Account, ApiResult } from "@felixos/shared-types";

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
