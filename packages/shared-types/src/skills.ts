export type TrustRung = "suggest" | "draft-and-wait" | "act-and-log" | "full-auto";

export type SkillKind = "capture" | "action" | "n8n-workflow";

export type SkillSideEffectClass = "none" | "draft" | "write" | "send";

export type SkillDescriptor = {
  name: string;
  purpose: string;
  triggers: string[];
  kind: SkillKind;
  inputSchema: Record<string, unknown>;
  sideEffectClass: SkillSideEffectClass;
  defaultRung: TrustRung;
  requiresInference: boolean;
};
