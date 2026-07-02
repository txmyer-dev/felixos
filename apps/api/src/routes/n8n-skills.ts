import { encryptSecret } from "@felixos/auth";
import { defaultRegistry } from "@felixos/agent";
import { tenantN8nSkills } from "@felixos/db";
import { isSkillNameSlug } from "@felixos/skills";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import type { TrustRung } from "@felixos/shared-types";

import { sendBadRequest, sendCreated, sendSuccess } from "../lib/responses.js";
import { createSetGuard } from "../lib/validation.js";
import { withRequestTenant } from "./context.js";

const isValidRung = createSetGuard<TrustRung>(
  new Set<TrustRung>(["suggest", "draft-and-wait", "act-and-log", "full-auto"])
);

type RegisterN8nSkillBody = {
  n8nWorkflowId?: string;
  skillName?: string;
  webhookUrl?: string;
  webhookAuthHeader?: string;
  webhookAuthValue?: string;
  inputSchema?: Record<string, unknown>;
  defaultRung?: string;
};

export const n8nSkillRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(tenantN8nSkills)
          .where(eq(tenantN8nSkills.tenantId, request.tenantId))
          .orderBy(tenantN8nSkills.skillName)
      )
    );

    return sendSuccess(reply, rows.map(toN8nSkillView));
  });

  fastify.post<{ Body: RegisterN8nSkillBody }>("/", async (request, reply) => {
    const body = request.body ?? {};
    const validation = validateRegistration(body, request.server.n8n.baseUrl);
    if (validation) return sendBadRequest(reply, validation);

    const encrypted =
      body.webhookAuthValue && body.webhookAuthHeader
        ? encryptSecret(body.webhookAuthValue, request.server.encryptionKey, request.server.keyId)
        : undefined;
    const now = new Date();
    const updateSet = {
      n8nWorkflowId: body.n8nWorkflowId!,
      webhookUrl: body.webhookUrl!,
      inputSchema: body.inputSchema ?? { type: "object" },
      defaultRung: (body.defaultRung ?? "act-and-log") as TrustRung,
      updatedAt: now,
      ...(encrypted
        ? {
            webhookAuthHeader: body.webhookAuthHeader!,
            webhookAuthCiphertext: encrypted.ciphertext,
            webhookAuthNonce: encrypted.nonce,
            webhookAuthKeyId: encrypted.keyId
          }
        : {})
    };

    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(tenantN8nSkills)
          .values({
            id: randomUUID(),
            tenantId: request.tenantId,
            n8nWorkflowId: body.n8nWorkflowId!,
            skillName: body.skillName!,
            webhookUrl: body.webhookUrl!,
            webhookAuthHeader: body.webhookAuthHeader,
            webhookAuthCiphertext: encrypted?.ciphertext,
            webhookAuthNonce: encrypted?.nonce,
            webhookAuthKeyId: encrypted?.keyId,
            inputSchema: body.inputSchema ?? { type: "object" },
            defaultRung: (body.defaultRung ?? "act-and-log") as TrustRung,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: [tenantN8nSkills.tenantId, tenantN8nSkills.skillName],
            set: updateSet
          })
          .returning()
      )
    );

    return sendCreated(reply, toN8nSkillView(row!));
  });

  fastify.delete<{ Params: { skillName: string } }>("/:skillName", async (request, reply) => {
    await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .delete(tenantN8nSkills)
          .where(
            and(
              eq(tenantN8nSkills.tenantId, request.tenantId),
              eq(tenantN8nSkills.skillName, request.params.skillName)
            )
          )
      )
    );

    return sendSuccess(reply, { deleted: true });
  });
};

function validateRegistration(body: RegisterN8nSkillBody, n8nBaseUrl: string): string | undefined {
  if (!body.n8nWorkflowId?.trim()) return "n8nWorkflowId is required";
  if (!body.skillName?.trim()) return "skillName is required";
  if (!isSkillNameSlug(body.skillName)) return "skillName must be a lowercase hyphenated slug";
  if (defaultRegistry.get(body.skillName)) return "skillName collides with a built-in skill";
  if (!body.webhookUrl?.trim()) return "webhookUrl is required";
  if (!n8nBaseUrl.trim()) return "n8n is not configured";
  if (body.webhookAuthValue && !body.webhookAuthHeader?.trim()) {
    return "webhookAuthHeader is required when webhookAuthValue is provided";
  }
  if (body.defaultRung !== undefined && !isValidRung(body.defaultRung)) {
    return "defaultRung must be one of: suggest, draft-and-wait, act-and-log, full-auto";
  }
  try {
    const url = new URL(body.webhookUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "webhookUrl must be http(s)";
    const baseUrl = new URL(n8nBaseUrl);
    if (url.origin !== baseUrl.origin) return "webhookUrl must use the configured n8n origin";
    if (!url.pathname.startsWith("/webhook/") && !url.pathname.startsWith("/webhook-test/")) {
      return "webhookUrl must point to an n8n webhook path";
    }
  } catch {
    return "webhookUrl must be a valid URL";
  }
  return undefined;
}

function toN8nSkillView(row: typeof tenantN8nSkills.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    n8nWorkflowId: row.n8nWorkflowId,
    skillName: row.skillName,
    webhookUrl: row.webhookUrl,
    ...(row.webhookAuthHeader ? { webhookAuthHeader: row.webhookAuthHeader } : {}),
    inputSchema: row.inputSchema,
    defaultRung: row.defaultRung,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
