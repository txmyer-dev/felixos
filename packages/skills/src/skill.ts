import type { ScopedDatabaseClient } from "@felixos/db";
import type { ClarificationOption, SkillDescriptor } from "@felixos/shared-types";

export type SkillContext = {
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  provider: unknown;
  encryptionKey?: Buffer;
};

export type SkillResult<TOutput = unknown> = {
  output: TOutput;
};

/**
 * Returned from `execute` when a skill cannot uniquely resolve an entity
 * reference. The trust ladder short-circuits on this: nothing is queued and
 * nothing is committed — the question is surfaced to the operator, whose reply
 * is a fresh agent run turn carrying the chosen candidate id.
 */
export type NeedsClarification = {
  kind: "needs-clarification";
  question: string;
  options: ClarificationOption[];
};

/**
 * Returned from `afterApproval` (the sole commit path). `result` is the
 * committed outcome (e.g. the created row id) logged to the audit ledger;
 * `reversal` carries whatever `reverse` needs to undo the write (before-state
 * for an edit, the created id for a create). Legacy skills may still return
 * `void` — the ladder treats a missing outcome as "nothing to log or reverse".
 */
export type AfterApprovalOutcome<TResult = unknown, TReversal = unknown> = {
  result?: TResult;
  reversal?: TReversal;
};

/** The persisted ledger row a `reverse` implementation reads to undo its write. */
export type ReverseRecord<TInput = unknown, TResult = unknown, TReversal = unknown> = {
  payload: TInput;
  result: TResult | null;
  reversal: TReversal | null;
};

export type Skill<TInput = unknown, TOutput = unknown> = {
  descriptor: SkillDescriptor;
  /**
   * Plan/commit skills (`commitsInAfterApproval: true`) split work in two:
   * `execute` is a side-effect-free planning + validation + reference-resolution
   * step (which may return `NeedsClarification`), and `afterApproval` is the sole
   * commit path. The trust ladder then treats the rung as pure timing — act-and-log
   * and full-auto call `execute` then `afterApproval`; draft-and-wait calls
   * `execute` only to surface a clarification and defers `afterApproval` to approval.
   *
   * Legacy single-effect skills leave this `false`/undefined: `execute` performs
   * the side effect (used at act-and-log/full-auto), or `afterApproval` does (used
   * on draft-and-wait approval), and the ladder calls exactly one of them. Setting
   * this true on a skill whose `execute` has side effects would double-commit.
   */
  commitsInAfterApproval?: boolean;
  /**
   * Plan the change (plan/commit skills) or perform it (legacy act-and-log
   * skills). Returns the planned/actual outcome, or `NeedsClarification` when a
   * reference is ambiguous.
   */
  execute(input: TInput, ctx: SkillContext): Promise<TOutput | NeedsClarification>;
  /** Commit the planned change. The sole write path for plan/commit skills. */
  afterApproval?(payload: TInput, ctx: SkillContext): Promise<AfterApprovalOutcome | void>;
  /** Undo a previously committed change, using the persisted result/reversal. */
  reverse?(record: ReverseRecord<TInput>, ctx: SkillContext): Promise<void>;
};

export function isNeedsClarification(value: unknown): value is NeedsClarification {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "needs-clarification"
  );
}
