import type { ScopedDatabaseClient } from "@felixos/db";
import type { SkillDescriptor } from "@felixos/shared-types";

export type SkillContext = {
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  provider: unknown;
};

export type SkillResult<TOutput = unknown> = {
  output: TOutput;
};

export type Skill<TInput = unknown, TOutput = unknown> = {
  descriptor: SkillDescriptor;
  execute(input: TInput, ctx: SkillContext): Promise<TOutput>;
  afterApproval?(payload: TInput, ctx: SkillContext): Promise<void>;
};
