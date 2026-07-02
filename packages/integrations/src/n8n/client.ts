import { N8nUnavailableError } from "./errors.js";

import type {
  N8nClient,
  N8nClientConfig,
  N8nExecution,
  N8nExecutionListFilters,
  N8nPaginatedResult,
  N8nWorkflow,
  N8nWorkflowListFilters
} from "./types.js";

type N8nListResponse<T> = {
  data?: T[];
  nextCursor?: string | null;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const defaultTimeoutMs = 5_000;
const defaultCacheTtlMs = 15_000;

export function createEnvN8nClient(): N8nClient {
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("N8N_BASE_URL and N8N_API_KEY are required");
  }

  return createN8nClient({ baseUrl, apiKey });
}

export function createN8nClient(config: N8nClientConfig): N8nClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiBaseUrl = `${baseUrl}/api/v1`;
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? defaultTimeoutMs;
  const cacheTtlMs = config.cacheTtlMs ?? defaultCacheTtlMs;
  const cache = new Map<string, CacheEntry<unknown>>();

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await requestInternal<T>(path, init, false)) as T;
  }

  async function requestOptional<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
    return requestInternal<T>(path, init, true);
  }

  async function requestInternal<T>(
    path: string,
    init: RequestInit = {},
    optionalNotFound: boolean
  ): Promise<T | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          "X-N8N-API-KEY": config.apiKey,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers
        },
        signal: controller.signal
      });

      if (response.status === 404) {
        if (optionalNotFound) return undefined;
        throw new N8nUnavailableError("n8n resource not found");
      }

      if (!response.ok) {
        throw new N8nUnavailableError(`n8n request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof N8nUnavailableError) throw error;
      throw new N8nUnavailableError(error instanceof Error ? error.message : "n8n is unavailable", {
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (cacheTtlMs <= 0) return loader();

    const now = Date.now();
    const cachedEntry = cache.get(key) as CacheEntry<T> | undefined;
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.value;
    }

    const value = loader();
    cache.set(key, { expiresAt: now + cacheTtlMs, value });
    value.catch(() => cache.delete(key));
    return value;
  }

  return {
    baseUrl,
    listWorkflows(filters = {}) {
      const query = toQueryString(filters);
      return cached(`workflows:${query}`, async () =>
        normalizeListResponse<N8nWorkflow>(await request(`/workflows${query}`))
      );
    },
    getWorkflow(id) {
      return cached(`workflow:${id}`, () =>
        requestOptional<N8nWorkflow>(`/workflows/${encodeURIComponent(id)}`)
      );
    },
    activateWorkflow(id) {
      return request<N8nWorkflow>(`/workflows/${encodeURIComponent(id)}/activate`, {
        method: "POST"
      });
    },
    deactivateWorkflow(id) {
      return request<N8nWorkflow>(`/workflows/${encodeURIComponent(id)}/deactivate`, {
        method: "POST"
      });
    },
    listExecutions(filters = {}) {
      const query = toQueryString(filters);
      return cached(`executions:${query}`, async () =>
        normalizeListResponse<N8nExecution>(await request(`/executions${query}`))
      );
    },
    getExecution(id) {
      return requestOptional<N8nExecution>(`/executions/${encodeURIComponent(id)}`);
    },
    retryExecution(id) {
      return request<N8nExecution>(`/executions/${encodeURIComponent(id)}/retry`, {
        method: "POST"
      });
    },
    stopExecution(id) {
      return request<N8nExecution>(`/executions/${encodeURIComponent(id)}/stop`, {
        method: "POST"
      });
    }
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

function toQueryString(filters: N8nWorkflowListFilters | N8nExecutionListFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function normalizeListResponse<T>(response: N8nListResponse<T>): N8nPaginatedResult<T> {
  return {
    items: response.data ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
