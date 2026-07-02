import { N8nUnavailableError, type N8nClient } from "@felixos/integrations";
import { describe, expect, it } from "vitest";

import { resolveWorkflowName } from "./n8n-workflow.js";

describe("n8n workflow skills", () => {
  it("falls back to the workflow id when n8n is unavailable during name resolution", async () => {
    const n8nClient = createStubN8n({
      async getWorkflow() {
        throw new N8nUnavailableError("n8n unavailable");
      }
    });

    await expect(resolveWorkflowName(n8nClient, "wf-offline")).resolves.toBe("wf-offline");
  });
});

function createStubN8n(overrides: Partial<N8nClient>): N8nClient {
  return {
    baseUrl: "https://n8n.example.test",
    async listWorkflows() {
      return { items: [], nextCursor: null };
    },
    async getWorkflow() {
      return undefined;
    },
    async activateWorkflow(id) {
      return { id, name: id, active: true };
    },
    async deactivateWorkflow(id) {
      return { id, name: id, active: false };
    },
    async listExecutions() {
      return { items: [], nextCursor: null };
    },
    async getExecution() {
      return undefined;
    },
    async retryExecution(id) {
      return { id };
    },
    async stopExecution(id) {
      return { id };
    },
    ...overrides
  };
}
