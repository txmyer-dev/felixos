export type PendingActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export type PendingActionView = {
  id: string;
  tenantId: string;
  skillName: string;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  agentContext: string | null;
  createdAt: string;
  updatedAt: string;
};
