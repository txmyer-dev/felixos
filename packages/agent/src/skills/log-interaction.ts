import { interactions, runWithTenantContext } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { NeedsClarification, Skill, SkillContext } from "@felixos/skills";

import { resolveContactRef, resolveEntityRef, resolveOrClarify } from "../lib/entity-ref.js";

const INTERACTION_KINDS = ["email", "meeting", "call", "note", "task", "other"] as const;
type InteractionKind = (typeof INTERACTION_KINDS)[number];

export type LogInteractionInput = {
  account: string; // account name or id
  summary: string;
  kind?: string;
  occurredAt?: string;
  contact?: string; // optional contact name or id, scoped to the account
};

export type LogInteractionPlan = {
  accountId: string;
  kind: InteractionKind;
  summary: string;
  occurredAt: string;
  contactId?: string;
};

async function planLogInteraction(
  input: LogInteractionInput,
  ctx: SkillContext
): Promise<LogInteractionPlan | NeedsClarification> {
  const summary = input.summary?.trim();
  if (!summary) {
    throw new Error("log-interaction: summary is required");
  }
  const account = input.account?.trim();
  if (!account) {
    throw new Error("log-interaction: account is required");
  }
  const kind = (input.kind ?? "note") as InteractionKind;
  if (!INTERACTION_KINDS.includes(kind)) {
    throw new Error(`log-interaction: kind must be one of ${INTERACTION_KINDS.join(", ")}`);
  }

  const accountResolution = await resolveEntityRef({
    ref: account,
    tenantId: ctx.tenantId,
    scopedDb: ctx.scopedDb
  });
  const resolvedAccount = resolveOrClarify(account, accountResolution, "account", "accountId");
  if ("kind" in resolvedAccount) {
    return resolvedAccount;
  }

  let contactId: string | undefined;
  const contact = input.contact?.trim();
  if (contact) {
    const contactResolution = await resolveContactRef({
      ref: contact,
      tenantId: ctx.tenantId,
      scopedDb: ctx.scopedDb,
      accountId: resolvedAccount.id
    });
    const resolvedContact = resolveOrClarify(contact, contactResolution, "contact", "contactId");
    if ("kind" in resolvedContact) {
      return resolvedContact;
    }
    contactId = resolvedContact.id;
  }

  return {
    accountId: resolvedAccount.id,
    kind,
    summary,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...(contactId !== undefined ? { contactId } : {})
  };
}

export const LogInteractionSkill: Skill<LogInteractionInput, LogInteractionPlan> = {
  descriptor: {
    name: "log-interaction",
    purpose:
      "Log an interaction (call, meeting, email, note) with an account. USE WHEN log a call, record a meeting, note that, log interaction, had a call with.",
    triggers: ["log a call", "record a meeting", "log interaction", "note that", "had a call with"],
    kind: "action",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string" },
        summary: { type: "string" },
        kind: { type: "string", enum: [...INTERACTION_KINDS] },
        occurredAt: { type: "string" },
        contact: { type: "string" }
      },
      required: ["account", "summary"]
    },
    sideEffectClass: "write",
    defaultRung: "act-and-log",
    requiresInference: false
  },

  commitsInAfterApproval: true,

  async execute(input: LogInteractionInput, ctx: SkillContext) {
    return planLogInteraction(input, ctx);
  },

  async afterApproval(input: LogInteractionInput, ctx: SkillContext) {
    const plan = await planLogInteraction(input, ctx);
    // NeedsClarification.kind === "needs-clarification" is the discriminator;
    // a real InteractionKind never equals it. Narrows plan to LogInteractionPlan.
    if (plan.kind === "needs-clarification") {
      throw new Error(`log-interaction: ${plan.question}`);
    }
    const committed = plan;
    const id = randomUUID();
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(interactions).values({
          id,
          tenantId: ctx.tenantId,
          accountId: committed.accountId,
          kind: committed.kind,
          summary: committed.summary,
          occurredAt: new Date(committed.occurredAt),
          ...(committed.contactId !== undefined ? { contactId: committed.contactId } : {})
        })
      )
    );
    return { result: { interactionId: id }, reversal: { deletedInteractionId: id } };
  },

  async reverse(record, ctx: SkillContext) {
    const id = (record.reversal as { deletedInteractionId?: string } | null)?.deletedInteractionId;
    if (!id) return;
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) => tx.delete(interactions).where(eq(interactions.id, id)))
    );
  }
};
