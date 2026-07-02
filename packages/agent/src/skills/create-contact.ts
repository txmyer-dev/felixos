import { contacts, runWithTenantContext } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { NeedsClarification, Skill, SkillContext } from "@felixos/skills";

import { resolveEntityRef, resolveOrClarify } from "../lib/entity-ref.js";

export type CreateContactInput = {
  account: string; // account name or id
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

export type CreateContactPlan = {
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

async function planCreateContact(
  input: CreateContactInput,
  ctx: SkillContext
): Promise<CreateContactPlan | NeedsClarification> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error("create-contact: name is required");
  }
  const account = input.account?.trim();
  if (!account) {
    throw new Error("create-contact: account is required");
  }

  const resolution = await resolveEntityRef({
    ref: account,
    tenantId: ctx.tenantId,
    scopedDb: ctx.scopedDb
  });
  const resolved = resolveOrClarify(account, resolution, "account", "accountId");
  if ("kind" in resolved) {
    return resolved;
  }

  return {
    accountId: resolved.id,
    name,
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.role?.trim() ? { role: input.role.trim() } : {})
  };
}

export const CreateContactSkill: Skill<CreateContactInput, CreateContactPlan> = {
  descriptor: {
    name: "create-contact",
    purpose:
      "Create a contact (person) under an account. USE WHEN add contact, new contact, add person, add someone at, record a contact.",
    triggers: ["add contact", "new contact", "add person", "record contact", "add someone at"],
    kind: "action",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        role: { type: "string" }
      },
      required: ["account", "name"]
    },
    sideEffectClass: "write",
    defaultRung: "act-and-log",
    requiresInference: false
  },

  commitsInAfterApproval: true,

  async execute(input: CreateContactInput, ctx: SkillContext) {
    return planCreateContact(input, ctx);
  },

  async afterApproval(input: CreateContactInput, ctx: SkillContext) {
    const plan = await planCreateContact(input, ctx);
    if ("kind" in plan) {
      // Reference became ambiguous between plan and commit; do not guess.
      throw new Error(`create-contact: ${plan.question}`);
    }
    const id = randomUUID();
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(contacts).values({
          id,
          tenantId: ctx.tenantId,
          accountId: plan.accountId,
          name: plan.name,
          ...(plan.email !== undefined ? { email: plan.email } : {}),
          ...(plan.phone !== undefined ? { phone: plan.phone } : {}),
          ...(plan.role !== undefined ? { role: plan.role } : {})
        })
      )
    );
    return { result: { contactId: id }, reversal: { deletedContactId: id } };
  },

  async reverse(record, ctx: SkillContext) {
    const id = (record.reversal as { deletedContactId?: string } | null)?.deletedContactId;
    if (!id) return;
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) => tx.delete(contacts).where(eq(contacts.id, id)))
    );
  }
};
