import { tool } from "@openai/agents";

import type { Skill, SkillContext } from "@felixos/skills";
import type { TrustLadderStore } from "../trust-ladder.js";
import { invokeThroughTrustLadder } from "../trust-ladder.js";
import type { AgentRunContext } from "../runner.js";

export type SkillToolOpts = {
  skill: Skill<unknown, unknown>;
  ctx: SkillContext;
  store: TrustLadderStore;
  onOutcome?: (outcome: { kind: string; id?: string }) => void;
};

export function createSkillTool(opts: SkillToolOpts) {
  const { skill, ctx, store, onOutcome } = opts;
  const { descriptor } = skill;

  return tool<{ type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false }, AgentRunContext, string>({
    name: descriptor.name,
    description: descriptor.purpose,
    parameters: {
      type: "object" as const,
      properties: descriptor.inputSchema.properties as Record<string, unknown> ?? {},
      required: (descriptor.inputSchema.required as string[]) ?? [],
      additionalProperties: false as const
    },
    execute: async (input) => {
      const outcome = await invokeThroughTrustLadder(skill, input, ctx, store);
      const id = "id" in outcome ? outcome.id : undefined;
      onOutcome?.(id !== undefined ? { kind: outcome.kind, id } : { kind: outcome.kind });
      return JSON.stringify(outcome);
    }
  });
}
