import { describe, expect, it, vi } from "vitest";

import {
  getEffectiveRung,
  invokeThroughTrustLadder,
  type TrustLadderStore
} from "./trust-ladder.js";

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

    await expect(
      invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)
    ).resolves.toEqual({
      kind: "suggestion",
      skillName: "draft-email",
      payload: { subject: "hello" }
    });
    expect(execute).not.toHaveBeenCalled();
    expect(store.insertions).toEqual([]);
  });

  it("queues draft-and-wait skills without executing them", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const skill = makeSkill({ defaultRung: "draft-and-wait", execute });
    const store = makeStore({ pendingId: "pending-1" });

    await expect(
      invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)
    ).resolves.toEqual({
      kind: "pending",
      id: "pending-1",
      skillName: "draft-email"
    });
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

    await expect(
      invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)
    ).resolves.toEqual({
      kind: "executed",
      skillName: "draft-email",
      result: { draft: "done" }
    });
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

    await expect(
      invokeThroughTrustLadder(skill, { subject: "hello" }, context, store)
    ).resolves.toEqual({
      kind: "executed",
      skillName: "draft-email",
      result: { sent: true }
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.insertions).toEqual([]);
  });
});

describe("trust ladder — plan/commit skills", () => {
  it("surfaces a clarification without queuing or committing", async () => {
    const execute = vi.fn(async () => ({
      kind: "needs-clarification" as const,
      question: "Which Acme?",
      options: [{ label: "Acme Corp", accountId: "a-1" }]
    }));
    const afterApproval = vi.fn(async () => ({ result: { id: "x" } }));
    const skill = makePlanCommitSkill({ defaultRung: "act-and-log", execute, afterApproval });
    const store = makeStore();

    await expect(
      invokeThroughTrustLadder(skill, { accountName: "Acme" }, context, store)
    ).resolves.toEqual({
      kind: "clarification",
      skillName: "update-thing",
      question: "Which Acme?",
      options: [{ label: "Acme Corp", accountId: "a-1" }]
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(afterApproval).not.toHaveBeenCalled();
    expect(store.insertions).toEqual([]);
  });

  it("draft-and-wait plans via execute but defers the commit to approval", async () => {
    const execute = vi.fn(async () => ({ planned: true }));
    const afterApproval = vi.fn(async () => ({ result: { id: "x" } }));
    const skill = makePlanCommitSkill({ defaultRung: "draft-and-wait", execute, afterApproval });
    const store = makeStore({ pendingId: "pending-1" });

    await expect(
      invokeThroughTrustLadder(skill, { field: "value" }, context, store)
    ).resolves.toEqual({ kind: "pending", id: "pending-1", skillName: "update-thing" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(afterApproval).not.toHaveBeenCalled();
    expect(store.insertions).toEqual([
      {
        payload: { field: "value" },
        result: undefined,
        skillName: "update-thing",
        status: "pending",
        tenantId: "tenant-1"
      }
    ]);
  });

  it("act-and-log commits via afterApproval and logs result + reversal", async () => {
    const execute = vi.fn(async () => ({ planned: true }));
    const afterApproval = vi.fn(async () => ({
      result: { id: "row-1" },
      reversal: { before: { stage: "new" } }
    }));
    const skill = makePlanCommitSkill({ defaultRung: "act-and-log", execute, afterApproval });
    const store = makeStore({ pendingId: "executed-1" });

    await expect(
      invokeThroughTrustLadder(skill, { field: "value" }, context, store)
    ).resolves.toEqual({
      kind: "executed",
      skillName: "update-thing",
      result: { id: "row-1" }
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(afterApproval).toHaveBeenCalledTimes(1);
    expect(store.insertions).toEqual([
      {
        payload: { field: "value" },
        result: { id: "row-1" },
        reversal: { before: { stage: "new" } },
        skillName: "update-thing",
        status: "executed",
        tenantId: "tenant-1"
      }
    ]);
  });

  it("promotion fix: a plan/commit skill at act-and-log actually commits via afterApproval", async () => {
    // Regression guard for the latent bug: previously act-and-log called execute
    // only, so a skill whose write lives in afterApproval logged an executed action
    // without ever writing. It must now call afterApproval.
    const execute = vi.fn(async () => ({ planned: true }));
    const writes: string[] = [];
    const afterApproval = vi.fn(async () => {
      writes.push("committed");
      return { result: { id: "row-1" } };
    });
    const skill = makePlanCommitSkill({ defaultRung: "act-and-log", execute, afterApproval });
    const store = makeStore();

    await invokeThroughTrustLadder(skill, { field: "value" }, context, store);

    expect(writes).toEqual(["committed"]);
  });

  it("full-auto commits via afterApproval without logging", async () => {
    const execute = vi.fn(async () => ({ planned: true }));
    const afterApproval = vi.fn(async () => ({ result: { id: "row-1" } }));
    const skill = makePlanCommitSkill({ defaultRung: "full-auto", execute, afterApproval });
    const store = makeStore();

    await expect(
      invokeThroughTrustLadder(skill, { field: "value" }, context, store)
    ).resolves.toEqual({ kind: "executed", skillName: "update-thing", result: { id: "row-1" } });
    expect(afterApproval).toHaveBeenCalledTimes(1);
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

function makePlanCommitSkill(overrides: {
  defaultRung: Skill["descriptor"]["defaultRung"];
  execute: Skill<Record<string, unknown>, unknown>["execute"];
  afterApproval?: Skill<Record<string, unknown>, unknown>["afterApproval"];
}): Skill<Record<string, unknown>, unknown> {
  return {
    descriptor: {
      name: "update-thing",
      purpose: "Update a thing. USE WHEN update thing.",
      triggers: ["update thing"],
      kind: "action",
      inputSchema: { type: "object" },
      sideEffectClass: "write",
      defaultRung: overrides.defaultRung,
      requiresInference: false
    },
    commitsInAfterApproval: true,
    execute: overrides.execute,
    ...(overrides.afterApproval ? { afterApproval: overrides.afterApproval } : {})
  };
}

function makeStore(
  opts: {
    rung?: Skill["descriptor"]["defaultRung"];
    pendingId?: string;
  } = {}
): TrustLadderStore & {
  insertions: Array<{
    tenantId: string;
    skillName: string;
    payload: unknown;
    status: "pending" | "executed";
    result?: unknown;
    reversal?: unknown;
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
