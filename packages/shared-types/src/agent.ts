export type PendingActionStatus =
  "pending" | "approved" | "rejected" | "executed" | "failed" | "reversed";

export type PendingActionView = {
  id: string;
  tenantId: string;
  skillName: string;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  targetEntityId: string | null;
  agentContext: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A single disambiguation choice offered when a skill cannot uniquely resolve an
 * entity reference. `label` is human-readable; the remaining keys carry the
 * resolved candidate id(s) (e.g. `accountId`) or a create-new sentinel so the
 * follow-up agent turn is self-contained in the stateless run.
 */
export type ClarificationOption = {
  label: string;
} & Record<string, unknown>;

/** A skill's request for the operator to disambiguate before any write happens. */
export type AgentClarification = {
  question: string;
  options: ClarificationOption[];
};
