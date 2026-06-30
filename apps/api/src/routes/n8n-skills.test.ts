import { describe, expect, it } from "vitest";

import { validateRegistration } from "./n8n-skills.js";

const baseBody = {
  n8nWorkflowId: "wf-1",
  skillName: "sync-psa",
  webhookUrl: "https://n8n.example.test/webhook/sync-psa"
};

describe("validateRegistration", () => {
  it("accepts a well-formed registration against the configured n8n origin", () => {
    expect(validateRegistration(baseBody, "https://n8n.example.test")).toBeUndefined();
  });

  it("rejects a webhookUrl on a different origin than the configured n8n instance", () => {
    expect(
      validateRegistration(
        { ...baseBody, webhookUrl: "https://attacker.example/webhook/sync-psa" },
        "https://n8n.example.test"
      )
    ).toBe("webhookUrl must use the configured n8n origin");
  });

  it("rejects registration outright when n8n is not configured, instead of skipping the origin check", () => {
    expect(
      validateRegistration(
        { ...baseBody, webhookUrl: "https://attacker.example/webhook/sync-psa" },
        ""
      )
    ).toBe("n8n is not configured; cannot register a workflow skill");
  });

  it("rejects an empty-string defaultRung instead of silently passing it through", () => {
    expect(validateRegistration({ ...baseBody, defaultRung: "" }, "https://n8n.example.test")).toBe(
      "defaultRung must be one of: suggest, draft-and-wait, act-and-log, full-auto"
    );
  });

  it("accepts a valid defaultRung", () => {
    expect(
      validateRegistration(
        { ...baseBody, defaultRung: "draft-and-wait" },
        "https://n8n.example.test"
      )
    ).toBeUndefined();
  });

  it("rejects a skillName that is not a lowercase hyphenated slug", () => {
    expect(
      validateRegistration({ ...baseBody, skillName: "Sync PSA!" }, "https://n8n.example.test")
    ).toBe("skillName must be a lowercase hyphenated slug");
  });

  it("rejects a skillName that collides with a built-in agent skill", () => {
    expect(
      validateRegistration({ ...baseBody, skillName: "create-task" }, "https://n8n.example.test")
    ).toBe('skillName "create-task" collides with a built-in agent skill');
  });

  it("rejects a webhookUrl outside the webhook/webhook-test path prefix", () => {
    expect(
      validateRegistration(
        { ...baseBody, webhookUrl: "https://n8n.example.test/api/v1/workflows/wf-1" },
        "https://n8n.example.test"
      )
    ).toBe("webhookUrl must point to an n8n webhook path");
  });
});
