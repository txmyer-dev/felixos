import { entities, runWithTenantContext } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { Skill, SkillContext } from "@felixos/skills";

const LIFECYCLE_STAGES = ["prospect", "client", "former_client"] as const;
type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type CreateAccountInput = {
  name: string;
  lifecycleStage?: string;
};

export type CreateAccountPlan = {
  name: string;
  lifecycleStage: LifecycleStage;
};

function planCreateAccount(input: CreateAccountInput): CreateAccountPlan {
  const name = input.name?.trim();
  if (!name) {
    throw new Error("create-account: name is required");
  }
  const lifecycleStage = (input.lifecycleStage ?? "prospect") as LifecycleStage;
  if (!LIFECYCLE_STAGES.includes(lifecycleStage)) {
    throw new Error(`create-account: lifecycleStage must be one of ${LIFECYCLE_STAGES.join(", ")}`);
  }
  return { name, lifecycleStage };
}

export const CreateAccountSkill: Skill<CreateAccountInput, CreateAccountPlan> = {
  descriptor: {
    name: "create-account",
    purpose:
      "Create a new account (company or organization). USE WHEN create account, add account, new account, onboard company, add client.",
    triggers: ["create account", "add account", "new account", "onboard company", "add client"],
    kind: "action",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        lifecycleStage: { type: "string", enum: [...LIFECYCLE_STAGES] }
      },
      required: ["name"]
    },
    sideEffectClass: "write",
    defaultRung: "act-and-log",
    requiresInference: false
  },

  commitsInAfterApproval: true,

  async execute(input: CreateAccountInput): Promise<CreateAccountPlan> {
    return planCreateAccount(input);
  },

  async afterApproval(input: CreateAccountInput, ctx: SkillContext) {
    const plan = planCreateAccount(input);
    const id = randomUUID();
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(entities).values({
          id,
          tenantId: ctx.tenantId,
          name: plan.name,
          lifecycleStage: plan.lifecycleStage
        })
      )
    );
    return { result: { entityId: id }, reversal: { deletedEntityId: id } };
  },

  async reverse(record, ctx: SkillContext) {
    const id = (record.reversal as { deletedEntityId?: string } | null)?.deletedEntityId;
    if (!id) return;
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) => tx.delete(entities).where(eq(entities.id, id)))
    );
  }
};
