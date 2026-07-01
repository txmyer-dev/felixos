import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Account, ApiResult } from "@felixos/shared-types";

const apiOrigin = process.env.FELIXOS_API_ORIGIN ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  headers.set("cookie", cookieStore.toString());
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `FelixOS API request failed: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as ApiResult<T>;
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>("/entities");
}
