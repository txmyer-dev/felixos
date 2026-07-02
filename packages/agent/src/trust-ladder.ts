import type { ClarificationOption, TrustRung } from "@felixos/shared-types";
import { isNeedsClarification, type Skill, type SkillContext } from "@felixos/skills";

export type TrustLadderStore = {
  getRungOverride(tenantId: string, skillName: string): Promise<TrustRung | undefined>;
  insertPendingAction(row: {
    tenantId: string;
    skillName: string;
    payload: unknown;
    status: "pending" | "executed";
    result?: unknown;
    reversal?: unknown;
  }): Promise<string>;
};

export type TrustLadderOutcome =
  | { kind: "suggestion"; skillName: string; payload: unknown }
  | { kind: "clarification"; skillName: string; question: string; options: ClarificationOption[] }
  | { kind: "pending"; id: string; skillName: string }
  | { kind: "executed"; skillName: string; result: unknown };

export async function getEffectiveRung(
  skill: Skill<unknown, unknown>,
  context: SkillContext,
  store: TrustLadderStore
): Promise<TrustRung> {
  const override = await store.getRungOverride(context.tenantId, skill.descriptor.name);
  return override ?? skill.descriptor.defaultRung;
}

export async function invokeThroughTrustLadder(
  skill: Skill<unknown, unknown>,
  input: unknown,
  context: SkillContext,
  store: TrustLadderStore
): Promise<TrustLadderOutcome> {
  const rung = await getEffectiveRung(skill, context, store);
  const skillName = skill.descriptor.name;

  return skill.commitsInAfterApproval
    ? invokePlanCommit(skill, input, context, store, rung, skillName)
    : invokeSingleEffect(skill, input, context, store, rung, skillName);
}

/**
 * Plan/commit skills: `execute` plans (side-effect-free, may ask for
 * clarification), `afterApproval` is the sole commit. The rung is pure timing —
 * act-and-log/full-auto commit immediately; draft-and-wait defers the commit to
 * the approval route.
 */
async function invokePlanCommit(
  skill: Skill<unknown, unknown>,
  input: unknown,
  context: SkillContext,
  store: TrustLadderStore,
  rung: TrustRung,
  skillName: string
): Promise<TrustLadderOutcome> {
  const planned = await skill.execute(input, context);
  if (isNeedsClarification(planned)) {
    return {
      kind: "clarification",
      skillName,
      question: planned.question,
      options: planned.options
    };
  }

  if (rung === "suggest") {
    return { kind: "suggestion", skillName, payload: planned };
  }

  if (rung === "draft-and-wait") {
    const id = await store.insertPendingAction({
      tenantId: context.tenantId,
      skillName,
      payload: input,
      status: "pending"
    });
    return { kind: "pending", id, skillName };
  }

  // act-and-log or full-auto: commit now via afterApproval.
  const outcome = skill.afterApproval ? await skill.afterApproval(input, context) : undefined;
  const result =
    outcome && "result" in outcome && outcome.result !== undefined ? outcome.result : planned;
  const reversal = outcome && "reversal" in outcome ? outcome.reversal : undefined;

  if (rung === "act-and-log") {
    await store.insertPendingAction({
      tenantId: context.tenantId,
      skillName,
      payload: input,
      status: "executed",
      result,
      ...(reversal !== undefined ? { reversal } : {})
    });
  }

  return { kind: "executed", skillName, result };
}

/**
 * Legacy single-effect skills (unchanged from Phase 3): the ladder calls exactly
 * one side effect — `execute` at act-and-log/full-auto, or `afterApproval` on
 * draft-and-wait approval (invoked by the approval route, not here).
 */
async function invokeSingleEffect(
  skill: Skill<unknown, unknown>,
  input: unknown,
  context: SkillContext,
  store: TrustLadderStore,
  rung: TrustRung,
  skillName: string
): Promise<TrustLadderOutcome> {
  if (rung === "suggest") {
    return { kind: "suggestion", skillName, payload: input };
  }

  if (rung === "draft-and-wait") {
    const id = await store.insertPendingAction({
      tenantId: context.tenantId,
      skillName,
      payload: input,
      status: "pending",
      result: undefined
    });
    return { kind: "pending", id, skillName };
  }

  const result = await skill.execute(input, context);

  if (rung === "act-and-log") {
    await store.insertPendingAction({
      tenantId: context.tenantId,
      skillName,
      payload: input,
      status: "executed",
      result
    });
  }

  return { kind: "executed", skillName, result };
}
