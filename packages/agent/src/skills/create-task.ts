import { interactions, runWithTenantContext } from "@felixos/db";
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

  async execute(input: CreateTaskInput): Promise<CreateTaskOutput> {
    return {
      accountId: input.accountId,
      summary: input.summary,
      occurredAt: input.occurredAt ?? new Date().toISOString()
    };
  },

  async afterApproval(payload: CreateTaskInput, ctx: SkillContext): Promise<void> {
    const occurredAt = payload.occurredAt ?? new Date().toISOString();

    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(interactions).values({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          accountId: payload.accountId,
          kind: "task",
          occurredAt: new Date(occurredAt),
          summary: payload.summary
        })
      )
    );
  }
};
