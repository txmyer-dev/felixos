import { describe, expect, it } from "vitest";

import {
  isNeedsClarification,
  type NeedsClarification,
  type Skill,
  type SkillContext
} from "./index.js";

describe("isNeedsClarification", () => {
  it("recognizes a needs-clarification result", () => {
    const result: NeedsClarification = {
      kind: "needs-clarification",
      question: "Which Acme?",
      options: [{ label: "Acme Corp", accountId: "a-1" }]
    };

    expect(isNeedsClarification(result)).toBe(true);
  });

  it("rejects a planned output and non-objects", () => {
    expect(isNeedsClarification({ id: "row-1" })).toBe(false);
    expect(isNeedsClarification({ kind: "planned" })).toBe(false);
    expect(isNeedsClarification(null)).toBe(false);
    expect(isNeedsClarification("needs-clarification")).toBe(false);
  });
});

describe("Skill contract", () => {
  it("accepts a plan/commit skill with reverse and clarification", async () => {
    const ctx = {} as SkillContext;
    const created: string[] = [];

    const skill: Skill<{ name: string }, { id: string }> = {
      descriptor: {
        name: "create-thing",
        purpose: "Create a thing. USE WHEN create thing.",
        triggers: ["create thing"],
        kind: "action",
        inputSchema: { type: "object" },
        sideEffectClass: "write",
        defaultRung: "act-and-log",
        requiresInference: false
      },
      async execute(input) {
        if (!input.name) {
          return { kind: "needs-clarification", question: "Name?", options: [{ label: "skip" }] };
        }
        return { id: "planned" };
      },
      async afterApproval(payload) {
        created.push(payload.name);
        return { result: { id: payload.name }, reversal: { deletedId: payload.name } };
      },
      async reverse(record) {
        const idx = created.indexOf((record.reversal as { deletedId: string }).deletedId);
        if (idx >= 0) created.splice(idx, 1);
      }
    };

    const clarify = await skill.execute({ name: "" }, ctx);
    expect(isNeedsClarification(clarify)).toBe(true);

    const outcome = await skill.afterApproval!({ name: "acme" }, ctx);
    expect(created).toEqual(["acme"]);

    await skill.reverse!(
      { payload: { name: "acme" }, result: { id: "acme" }, reversal: { deletedId: "acme" } },
      ctx
    );
    expect(created).toEqual([]);
    expect(outcome).toEqual({ result: { id: "acme" }, reversal: { deletedId: "acme" } });
  });

  it("still accepts a legacy skill whose execute returns a plain output", async () => {
    const legacy: Skill<{ text: string }, { echoed: string }> = {
      descriptor: {
        name: "legacy-echo",
        purpose: "Echo. USE WHEN echo.",
        triggers: ["echo"],
        kind: "capture",
        inputSchema: { type: "object" },
        sideEffectClass: "none",
        defaultRung: "suggest",
        requiresInference: false
      },
      async execute(input) {
        return { echoed: input.text };
      }
    };

    const result = await legacy.execute({ text: "hi" }, {} as SkillContext);
    expect(isNeedsClarification(result)).toBe(false);
  });
});
