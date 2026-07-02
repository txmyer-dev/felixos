import { interactions, runWithTenantContext } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { Skill, SkillContext } from "@felixos/skills";

export type CreateTaskInput = {
  accountId: string;
  summary: string;
  occurredAt?: string;
};

export type CreateTaskOutput = {
  accountId: string;
  summary: string;
  occurredAt: string;
};

export const CreateTaskSkill: Skill<CreateTaskInput, CreateTaskOutput> = {
  descriptor: {
    name: "create-task",
    purpose:
      "Create a task interaction for an account. USE WHEN create task, add task, log task, schedule task.",
    triggers: ["create task", "add task", "log task", "schedule task"],
    kind: "action",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        summary: { type: "string" },
        occurredAt: { type: "string" }
      },
      required: ["accountId", "summary"]
    },
    sideEffectClass: "write",
    defaultRung: "draft-and-wait",
    requiresInference: true
  },

  // Plan/commit: execute only normalizes the input (no write); afterApproval is
  // the sole commit path. This keeps the skill correct at every rung — promoting
  // it to act-and-log now commits via afterApproval instead of silently no-op'ing.
  commitsInAfterApproval: true,

  async execute(input: CreateTaskInput): Promise<CreateTaskOutput> {
    return {
      accountId: input.accountId,
      summary: input.summary,
      occurredAt: input.occurredAt ?? new Date().toISOString()
    };
  },

  async afterApproval(payload: CreateTaskInput, ctx: SkillContext) {
    const id = randomUUID();
    const occurredAt = payload.occurredAt ?? new Date().toISOString();

    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(interactions).values({
          id,
          tenantId: ctx.tenantId,
          accountId: payload.accountId,
          kind: "task",
          occurredAt: new Date(occurredAt),
          summary: payload.summary
        })
      )
    );

    return { result: { interactionId: id }, reversal: { interactionId: id } };
  },

  async reverse(record, ctx: SkillContext) {
    const interactionId = (record.reversal as { interactionId?: string } | null)?.interactionId;
    if (!interactionId) return;

    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.delete(interactions).where(eq(interactions.id, interactionId))
      )
    );
  }
};
