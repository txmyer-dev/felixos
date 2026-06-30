import type { TrustRung } from "@felixos/shared-types";
import type { Skill, SkillContext } from "@felixos/skills";

export type TrustLadderStore = {
  getRungOverride(tenantId: string, skillName: string): Promise<TrustRung | undefined>;
  insertPendingAction(row: {
    tenantId: string;
    skillName: string;
    payload: unknown;
    status: "pending" | "executed";
    result?: unknown;
  }): Promise<string>;
};

export type TrustLadderOutcome =
  | { kind: "suggestion"; skillName: string; payload: unknown }
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
