import { describe, expect, it } from "vitest";

import type { SkillContext } from "@felixos/skills";

import { CreateAccountSkill } from "./create-account.js";

const ctx = {} as SkillContext;

describe("CreateAccountSkill.execute (validation)", () => {
  it("plans with the default lifecycle stage", async () => {
    await expect(CreateAccountSkill.execute({ name: "Acme Corp" }, ctx)).resolves.toEqual({
      name: "Acme Corp",
      lifecycleStage: "prospect"
    });
  });

  it("accepts a valid explicit lifecycle stage and trims the name", async () => {
    await expect(
      CreateAccountSkill.execute({ name: "  Globex  ", lifecycleStage: "client" }, ctx)
    ).resolves.toEqual({ name: "Globex", lifecycleStage: "client" });
  });

  it("rejects a missing name", async () => {
    await expect(CreateAccountSkill.execute({ name: "   " }, ctx)).rejects.toThrow(
      "name is required"
    );
  });

  it("rejects an invalid lifecycle stage", async () => {
    await expect(
      CreateAccountSkill.execute({ name: "Acme", lifecycleStage: "bogus" }, ctx)
    ).rejects.toThrow("lifecycleStage must be one of");
  });

  it("is a plan/commit act-and-log skill", () => {
    expect(CreateAccountSkill.commitsInAfterApproval).toBe(true);
    expect(CreateAccountSkill.descriptor.defaultRung).toBe("act-and-log");
    expect(CreateAccountSkill.descriptor.requiresInference).toBe(false);
  });
});
