import { describe, expect, it, vi } from "vitest";

import { getEffectiveRung, invokeThroughTrustLadder, type TrustLadderStore } from "./trust-ladder.js";

import type { Skill, SkillContext } from "@felixos/skills";

describe("trust ladder", () => {
  it("uses tenant rung override before descriptor default", async () => {
    const store = makeStore({ rung: "act-and-log" });
    const skill = makeSkill({ defaultRung: "draft-and-wait" });

    await expect(getEffectiveRung(skill, context, store)).resolves.toBe("act-and-log");
  });

  it("falls back to descriptor default rung", async () => {
    const store = makeStore();
    const skill = makeSkill({ defaultRung: "draft-and-wait" });

    await expect(getEffectiveRung(skill, context, store)).resolves.toBe("draft-and-wait");
  });

  it("does not execute suggest-rung skills", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const skill = makeSkill({ defaultRung: "suggest", execute });
    const store = makeStore();

    await expect(invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)).resolves.toEqual(
      {
        kind: "suggestion",
        skillName: "draft-email",
        payload: { subject: "hello" }
      }
    );
    expect(execute).not.toHaveBeenCalled();
    expect(store.insertions).toEqual([]);
  });

  it("queues draft-and-wait skills without executing them", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const skill = makeSkill({ defaultRung: "draft-and-wait", execute });
    const store = makeStore({ pendingId: "pending-1" });

    await expect(invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)).resolves.toEqual(
      {
        kind: "pending",
        id: "pending-1",
        skillName: "draft-email"
      }
    );
    expect(execute).not.toHaveBeenCalled();
    expect(store.insertions).toEqual([
      {
        payload: { subject: "hello" },
        result: undefined,
        skillName: "draft-email",
        status: "pending",
        tenantId: "tenant-1"
      }
    ]);
  });

  it("executes act-and-log skills once and logs the result", async () => {
    const execute = vi.fn(async () => ({ draft: "done" }));
    const skill = makeSkill({ defaultRung: "act-and-log", execute });
    const store = makeStore({ pendingId: "executed-1" });

    await expect(invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)).resolves.toEqual(
      {
        kind: "executed",
        skillName: "draft-email",
        result: { draft: "done" }
      }
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.insertions).toEqual([
      {
        payload: { subject: "hello" },
        result: { draft: "done" },
        skillName: "draft-email",
        status: "executed",
        tenantId: "tenant-1"
      }
    ]);
  });

  it("executes full-auto skills once without logging", async () => {
    const execute = vi.fn(async () => ({ sent: true }));
    const skill = makeSkill({ defaultRung: "full-auto", execute });
    const store = makeStore();

    await expect(invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)).resolves.toEqual(
      {
        kind: "executed",
        skillName: "draft-email",
        result: { sent: true }
      }
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.insertions).toEqual([]);
  });
});

const context = {
  tenantId: "tenant-1",
  scopedDb: {} as SkillContext["scopedDb"],
  provider: {}
} satisfies SkillContext;

function makeSkill(overrides: {
  defaultRung: Skill["descriptor"]["defaultRung"];
  execute?: Skill<Record<string, unknown>, unknown>["execute"];
}): Skill<Record<string, unknown>, unknown> {
  return {
    descriptor: {
      name: "draft-email",
      purpose: "Draft email. USE WHEN draft email, send email, compose email.",
      triggers: ["draft email", "send email", "compose email"],
      kind: "action",
      inputSchema: { type: "object" },
      sideEffectClass: "send",
      defaultRung: overrides.defaultRung,
      requiresInference: true
    },
    execute: overrides.execute ?? (async () => ({ ok: true }))
  };
}

function makeStore(opts: {
  rung?: Skill["descriptor"]["defaultRung"];
  pendingId?: string;
} = {}): TrustLadderStore & {
  insertions: Array<{
    tenantId: string;
    skillName: string;
    payload: unknown;
    status: "pending" | "executed";
    result?: unknown;
  }>;
} {
  const insertions: Array<{
    tenantId: string;
    skillName: string;
    payload: unknown;
    status: "pending" | "executed";
    result?: unknown;
  }> = [];

  return {
    insertions,
    async getRungOverride() {
      return opts.rung;
    },
    async insertPendingAction(row) {
      insertions.push(row);
      return opts.pendingId ?? "pending-id";
    }
  };
}
