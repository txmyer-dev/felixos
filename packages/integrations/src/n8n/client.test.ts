import { describe, expect, it } from "vitest";

import { createEnvN8nClient, createN8nClient } from "./client.js";
import { N8nUnavailableError } from "./errors.js";

describe("n8n client", () => {
  it("requires env config", () => {
    const previousBase = process.env.N8N_BASE_URL;
    const previousKey = process.env.N8N_API_KEY;
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;

    expect(() => createEnvN8nClient()).toThrow("N8N_BASE_URL and N8N_API_KEY are required");

    process.env.N8N_BASE_URL = previousBase;
    process.env.N8N_API_KEY = previousKey;
  });

  it("lists workflows with API key header and caches within the ttl", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = createFetchSpy(calls, async () =>
      jsonResponse({ data: [{ id: "1", name: "Flow" }] })
    );
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test/",
      apiKey: "secret",
      cacheTtlMs: 1_000,
      fetchImpl
    });

    await expect(client.listWorkflows()).resolves.toEqual({
      items: [{ id: "1", name: "Flow" }],
      nextCursor: null
    });
    await client.listWorkflows();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe("https://n8n.example.test/api/v1/workflows");
    expect(calls[0]!.init?.headers).toMatchObject({ "X-N8N-API-KEY": "secret" });
  });

  it("passes execution filters as query params", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = createFetchSpy(calls, async () =>
      jsonResponse({ data: [], nextCursor: "next" })
    );
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test",
      apiKey: "secret",
      cacheTtlMs: 0,
      fetchImpl
    });

    await expect(client.listExecutions({ status: "error", workflowId: "wf-1" })).resolves.toEqual({
      items: [],
      nextCursor: "next"
    });

    expect(calls[0]!.input).toBe(
      "https://n8n.example.test/api/v1/executions?status=error&workflowId=wf-1"
    );
  });

  it("posts workflow and execution control paths", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = createFetchSpy(calls, async () => jsonResponse({ id: "ok" }));
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test",
      apiKey: "secret",
      fetchImpl
    });

    await client.activateWorkflow("wf");
    await client.deactivateWorkflow("wf");
    await client.retryExecution("ex");
    await client.stopExecution("ex");

    expect(calls.map((call) => [call.input, call.init?.method])).toEqual([
      ["https://n8n.example.test/api/v1/workflows/wf/activate", "POST"],
      ["https://n8n.example.test/api/v1/workflows/wf/deactivate", "POST"],
      ["https://n8n.example.test/api/v1/executions/ex/retry", "POST"],
      ["https://n8n.example.test/api/v1/executions/ex/stop", "POST"]
    ]);
  });

  it("throws on 404 from mutation endpoints while optional reads return undefined", async () => {
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test",
      apiKey: "secret",
      fetchImpl: createFetchSpy([], async () => jsonResponse({ message: "missing" }, 404))
    });

    await expect(client.getWorkflow("missing")).resolves.toBeUndefined();
    await expect(client.getExecution("missing")).resolves.toBeUndefined();
    await expect(client.activateWorkflow("missing")).rejects.toBeInstanceOf(N8nUnavailableError);
    await expect(client.deactivateWorkflow("missing")).rejects.toBeInstanceOf(N8nUnavailableError);
    await expect(client.retryExecution("missing")).rejects.toBeInstanceOf(N8nUnavailableError);
    await expect(client.stopExecution("missing")).rejects.toBeInstanceOf(N8nUnavailableError);
  });

  it("caches workflow detail lookups within the ttl", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = createFetchSpy(calls, async () =>
      jsonResponse({ id: "wf", name: "Cached flow", active: true })
    );
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test",
      apiKey: "secret",
      cacheTtlMs: 1_000,
      fetchImpl
    });

    await client.getWorkflow("wf");
    await client.getWorkflow("wf");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe("https://n8n.example.test/api/v1/workflows/wf");
  });

  it("wraps non-2xx responses", async () => {
    const client = createN8nClient({
      baseUrl: "https://n8n.example.test",
      apiKey: "secret",
      fetchImpl: createFetchSpy([], async () => jsonResponse({ message: "down" }, 503))
    });

    await expect(client.listWorkflows()).rejects.toBeInstanceOf(N8nUnavailableError);
  });
});

type FetchCall = {
  input: string | URL | Request;
  init?: RequestInit;
};

function createFetchSpy(calls: FetchCall[], responder: () => Promise<Response>): typeof fetch {
  return async (input, init) => {
    calls.push(init === undefined ? { input } : { input, init });
    return responder();
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
