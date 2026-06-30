import type { Skill } from "@felixos/skills";

export type DraftEmailInput = {
  to: string;
  subject: string;
  body: string;
  entityId?: string;
};

export type DraftEmailOutput = {
  to: string;
  subject: string;
  body: string;
  entityId?: string;
};

export const DraftEmailSkill: Skill<DraftEmailInput, DraftEmailOutput> = {
  descriptor: {
    name: "draft-email",
    purpose:
      "Draft an outbound email for operator review before sending. USE WHEN draft email, send email, compose email, write email.",
    triggers: ["draft email", "send email", "compose email", "write email"],
    kind: "action",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        entityId: { type: "string" }
      },
      required: ["to", "subject", "body"]
    },
    sideEffectClass: "send",
    defaultRung: "draft-and-wait",
    requiresInference: true
  },

  async execute(input: DraftEmailInput): Promise<DraftEmailOutput> {
    return {
      to: input.to,
      subject: input.subject,
      body: input.body,
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {})
    };
  }
};
