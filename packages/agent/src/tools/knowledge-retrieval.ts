import { tool } from "@openai/agents";
import type { KnowledgeSearchResult } from "@felixos/shared-types";

import type { AgentRunContext } from "../runner.js";

export type KnowledgeRetrievalDeps = {
  embed: (text: string) => Promise<number[]>;
  search: (embedding: number[], opts?: { entityId?: string }) => Promise<KnowledgeSearchResult[]>;
};

const knowledgeRetrievalParameters = {
  type: "object" as const,
  properties: {
    query: {
      type: "string",
      description: "Natural language search query to find relevant facts, decisions, and actions"
    },
    entityId: {
      type: "string",
      description: "Optional entity UUID to scope the search to a specific account or contact"
    }
  },
  required: ["query"] as string[],
  additionalProperties: false as const
};

export function createKnowledgeRetrievalTool(deps: KnowledgeRetrievalDeps) {
  return tool<typeof knowledgeRetrievalParameters, AgentRunContext, string>({
    name: "retrieve_knowledge",
    description:
      "Search the tenant knowledge base for relevant distilled facts, decisions, and actions. Use this to ground answers in tenant-scoped context before responding.",
    parameters: knowledgeRetrievalParameters,
    execute: async (input) => {
      const { query, entityId } = input as { query: string; entityId?: string };
      const embedding = await deps.embed(query);
      const results = await deps.search(
        embedding,
        entityId !== undefined ? { entityId } : undefined
      );
      return JSON.stringify(
        results.map((r) => ({
          id: r.id,
          content: r.content,
          itemType: r.itemType,
          source: { id: r.source.id, sourceType: r.source.sourceType }
        }))
      );
    }
  });
}
