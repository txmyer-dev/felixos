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
