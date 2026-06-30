import { rawSources, runWithTenantContext } from "@felixos/db";
import { randomUUID } from "node:crypto";

import type { Skill, SkillContext } from "@felixos/skills";

export type DocNoteCaptureInput = {
  content: string;
  sourceType: "doc" | "note";
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export type DocNoteCaptureOutput = {
  sourceId: string;
  tenantId: string;
  sourceType: "doc" | "note";
};

export const DocNoteCaptureSkill: Skill<DocNoteCaptureInput, DocNoteCaptureOutput> = {
  descriptor: {
    name: "doc-note-capture",
    purpose:
      "Capture a document or note into the knowledge base. USE WHEN saving notes, documents, text content, markdown.",
    triggers: ["save note", "capture document", "save document", "add note", "store document"],
    kind: "capture",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        sourceType: { type: "string", enum: ["doc", "note"] },
        entityId: { type: "string" },
        metadata: { type: "object" }
      },
      required: ["content", "sourceType"]
    },
    sideEffectClass: "write",
    defaultRung: "act-and-log",
    requiresInference: false
  },

  async execute(input: DocNoteCaptureInput, ctx: SkillContext): Promise<DocNoteCaptureOutput> {
    if (!input.content.trim()) {
      throw new Error("DocNoteCaptureSkill: content must not be empty");
    }

    const id = randomUUID();
    await runWithTenantContext(ctx.tenantId, () =>
      (ctx.scopedDb as typeof ctx.scopedDb).transaction((tx) =>
        tx.insert(rawSources).values({
          id,
          tenantId: ctx.tenantId,
          ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
          sourceType: input.sourceType,
          content: input.content,
          metadata: input.metadata ?? {}
        })
      )
    );

    return { sourceId: id, tenantId: ctx.tenantId, sourceType: input.sourceType };
  }
};
