import "server-only";

import { cookies } from "next/headers";

import type { Account, ApiResult } from "@felixos/shared-types";

const apiOrigin = process.env.FELIXOS_API_ORIGIN ?? "http://localhost:3001";

export async function fetchAccounts(): Promise<Account[]> {
  const cookieStore = await cookies();
  const response = await fetch(`${apiOrigin}/entities`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const result = (await response.json()) as ApiResult<Account[]>;
  return result.ok ? result.data : [];
}
