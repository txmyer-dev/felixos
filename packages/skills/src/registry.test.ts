import { describe, expect, it } from "vitest";

import { SkillRegistry, type Skill, type SkillContext } from "./index.js";

describe("SkillRegistry", () => {
  it("registers skills and returns descriptors without implementations", () => {
    const registry = new SkillRegistry();
    const skill = makeSkill("doc-note-capture");

    registry.register(skill);

    expect(registry.get("doc-note-capture")).toBe(skill);
    expect(registry.listDescriptors()).toEqual([skill.descriptor]);
  });

  it("rejects duplicate skill names", () => {
    const registry = new SkillRegistry();

    registry.register(makeSkill("draft-email"));

    expect(() => registry.register(makeSkill("draft-email"))).toThrow(
      'Skill "draft-email" is already registered'
    );
  });

  it("enforces lowercase hyphenated descriptor names", () => {
    const registry = new SkillRegistry();

    expect(() => registry.register(makeSkill("DraftEmail"))).toThrow(
      "Skill name must be a lowercase hyphenated slug"
    );
  });

  it("passes tenant-scoped context to skill execution", async () => {
    const registry = new SkillRegistry();
    const seenContexts: SkillContext[] = [];
    const skill = makeSkill("create-task", {
      async execute(_input, context) {
        seenContexts.push(context);
        return { ok: true };
      }
    });
    const context = {
      tenantId: "tenant-1",
      scopedDb: {} as SkillContext["scopedDb"],
      provider: {}
    } satisfies SkillContext;

    registry.register(skill);

    await registry.get("create-task")?.execute({}, context);

    expect(seenContexts).toEqual([context]);
  });
});

function makeSkill(
  name: string,
  overrides: Partial<Skill<Record<string, never>, { ok: boolean }>> = {}
): Skill<Record<string, never>, { ok: boolean }> {
  return {
    descriptor: {
      name,
      purpose: "Test skill. USE WHEN test.",
      triggers: ["test"],
      kind: "action",
      inputSchema: {
        type: "object",
        additionalProperties: false
      },
      sideEffectClass: "draft",
      defaultRung: "draft-and-wait",
      requiresInference: false
    },
    async execute() {
      return { ok: true };
    },
    ...overrides
  };
}
