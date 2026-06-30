export type N8nWorkflowView = {
  id: string;
  name: string;
  active: boolean;
  tags?: Array<{ id?: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
};

export type N8nExecutionView = {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status?: string;
  startedAt?: string;
  stoppedAt?: string;
  finished?: boolean;
};

export type TenantN8nSkillView = {
  id: string;
  tenantId: string;
  n8nWorkflowId: string;
  skillName: string;
  webhookUrl: string;
  webhookAuthHeader?: string;
  inputSchema: Record<string, unknown>;
  defaultRung: string;
  createdAt: string;
  updatedAt: string;
};

export type N8nNeedsAttentionItem = {
  workflowName: string;
  n8nWorkflowId: string;
  executionId: string;
  failedAt: string;
  errorSummary: string;
  n8nUrl: string;
};
