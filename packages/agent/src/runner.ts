import {
  Agent,
  OpenAIProvider,
  run as runOpenAiAgent,
  type ModelProvider,
  type Tool
} from "@openai/agents";

export type AgentRunContext = {
  tenantId: string;
  entityId?: string;
};

export type InferenceProvider = {
  apiKey: string;
  model: string;
  baseURL?: string;
  supportsTools: boolean;
};

export type AgentTool = Tool<AgentRunContext>;

export type AgentRunOptions = {
  query: string;
  tools?: AgentTool[];
  provider: InferenceProvider;
  tenantId: string;
  entityId?: string;
};

export type AgentRunResult = {
  response: string;
  pendingActionIds: string[];
};

type AgentHandle = unknown;

export type AgentRuntime = {
  createAgent(config: {
    name: string;
    instructions: string;
    model: string;
    tools: AgentTool[];
  }): AgentHandle;
  createModelProvider(provider: InferenceProvider): ModelProvider;
  run(
    agent: AgentHandle,
    input: string,
    options: {
      context: AgentRunContext;
      maxTurns: number;
      modelProvider: ModelProvider;
      tracingDisabled: boolean;
      traceIncludeSensitiveData: boolean;
    }
  ): Promise<{ finalOutput?: unknown }>;
};

const defaultRuntime: AgentRuntime = {
  createAgent(config) {
    return new Agent<AgentRunContext>({
      name: config.name,
      instructions: config.instructions,
      model: config.model,
      tools: config.tools
    });
  },
  createModelProvider(provider) {
    const options = {
      apiKey: provider.apiKey,
      useResponses: false
    };

    return new OpenAIProvider(
      provider.baseURL ? { ...options, baseURL: provider.baseURL } : options
    );
  },
  async run(agent, input, options) {
    return runOpenAiAgent(agent as Agent<AgentRunContext>, input, options);
  }
};

export async function runAgent(
  opts: AgentRunOptions,
  runtime: AgentRuntime = defaultRuntime
): Promise<AgentRunResult> {
  if (!opts.provider.supportsTools && (opts.tools?.length ?? 0) > 0) {
    throw new Error("Configured inference provider does not support tool calls");
  }

  const agent = runtime.createAgent({
    name: "FelixOS Tenant Agent",
    instructions:
      "You are the FelixOS tenant agent. Use available tools when helpful, stay within the tenant context, and return a concise operator-facing answer.",
    model: opts.provider.model,
    tools: opts.tools ?? []
  });

  const result = await runtime.run(agent, opts.query, {
    context: buildRunContext(opts),
    maxTurns: 8,
    modelProvider: runtime.createModelProvider(opts.provider),
    tracingDisabled: true,
    traceIncludeSensitiveData: false
  });

  return {
    response: stringifyFinalOutput(result.finalOutput),
    pendingActionIds: []
  };
}

function buildRunContext(opts: AgentRunOptions): AgentRunContext {
  if (opts.entityId) {
    return { tenantId: opts.tenantId, entityId: opts.entityId };
  }

  return { tenantId: opts.tenantId };
}

function stringifyFinalOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined || output === null) return "";
  return JSON.stringify(output);
}
