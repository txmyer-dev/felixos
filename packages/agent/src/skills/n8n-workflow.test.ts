import { describe, expect, it } from "vitest";

import { resolveWorkflowName } from "./n8n-workflow.js";

import type { N8nClient } from "@felixos/integrations";

describe("resolveWorkflowName", () => {
  it("returns the workflow's name when n8n responds", async () => {
    const n8nClient = {
      getWorkflow: async () => ({ id: "wf-1", name: "Sync PSA", active: true })
    } as unknown as N8nClient;

    await expect(resolveWorkflowName(n8nClient, "wf-1")).resolves.toBe("Sync PSA");
  });

  it("falls back to the workflow id when n8n has no record of it", async () => {
    const n8nClient = {
      getWorkflow: async () => undefined
    } as unknown as N8nClient;

    await expect(resolveWorkflowName(n8nClient, "wf-1")).resolves.toBe("wf-1");
  });

  it("falls back to the workflow id instead of throwing when n8n is unreachable", async () => {
    const n8nClient = {
      getWorkflow: async () => {
        throw new Error("n8n is unavailable");
      }
    } as unknown as N8nClient;

    await expect(resolveWorkflowName(n8nClient, "wf-1")).resolves.toBe("wf-1");
  });
});
