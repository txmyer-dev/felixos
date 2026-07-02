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
   * Plan the change: resolve references and validate. Returns the planned
   * outcome, or a `NeedsClarification` signal when a reference is ambiguous.
   * Must not commit a side effect for skills that also define `afterApproval`.
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
