export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  tags?: Array<{ id?: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type N8nExecutionStatus =
  "canceled" | "crashed" | "error" | "new" | "running" | "success" | "unknown" | "waiting";

export type N8nExecution = {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status?: N8nExecutionStatus;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  finished?: boolean;
  data?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

export type N8nPaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export type N8nWorkflowListFilters = {
  active?: boolean;
  tags?: string | string[];
  name?: string;
  projectId?: string;
  limit?: number;
  cursor?: string;
};

export type N8nExecutionListFilters = {
  status?: N8nExecutionStatus;
  workflowId?: string;
  projectId?: string;
  limit?: number;
  cursor?: string;
};

export type N8nClientConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
};

export type N8nClient = {
  readonly baseUrl: string;
  listWorkflows(filters?: N8nWorkflowListFilters): Promise<N8nPaginatedResult<N8nWorkflow>>;
  getWorkflow(id: string): Promise<N8nWorkflow | undefined>;
  activateWorkflow(id: string): Promise<N8nWorkflow>;
  deactivateWorkflow(id: string): Promise<N8nWorkflow>;
  listExecutions(filters?: N8nExecutionListFilters): Promise<N8nPaginatedResult<N8nExecution>>;
  getExecution(id: string): Promise<N8nExecution | undefined>;
  retryExecution(id: string): Promise<N8nExecution>;
  stopExecution(id: string): Promise<N8nExecution>;
};
