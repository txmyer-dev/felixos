import { decryptSecret } from "@felixos/auth";

import type { TenantN8nSkillRow } from "@felixos/db";
import type { N8nClient } from "@felixos/integrations";
import type { Skill, SkillContext } from "@felixos/skills";
import type { SkillDescriptor } from "@felixos/shared-types";

export type N8nWorkflowSkillInput = Record<string, unknown>;

export type N8nWorkflowSkillOutput = {
  status: number;
  body: unknown;
};

export function createN8nWorkflowSkill(opts: {
  row: TenantN8nSkillRow;
  workflowName: string;
  fetchImpl?: typeof fetch | undefined;
}): Skill<N8nWorkflowSkillInput, N8nWorkflowSkillOutput> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const descriptor: SkillDescriptor = {
    name: opts.row.skillName,
    purpose: `Invoke the n8n workflow "${opts.workflowName}" for deterministic automation.`,
    triggers: [opts.workflowName, opts.row.skillName],
    kind: "n8n-workflow",
    inputSchema: opts.row.inputSchema,
    sideEffectClass: "write",
    defaultRung: opts.row.defaultRung,
    requiresInference: false
  };

  async function invokeWebhook(
    payload: N8nWorkflowSkillInput,
    ctx: SkillContext
  ): Promise<N8nWorkflowSkillOutput> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const authValue = decryptWebhookAuth(opts.row, ctx);
    if (opts.row.webhookAuthHeader && authValue) {
      headers[opts.row.webhookAuthHeader] = authValue;
    }

    const response = await fetchImpl(opts.row.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const body = await parseWebhookResponse(response);

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}`);
    }

    return { status: response.status, body };
  }

  return {
    descriptor,
    execute(input, ctx) {
      return invokeWebhook(input, ctx);
    },
    async afterApproval(payload, ctx) {
      await invokeWebhook(payload, ctx);
    }
  };
}

export async function resolveWorkflowName(
  n8nClient: N8nClient,
  workflowId: string
): Promise<string> {
  try {
    const workflow = await n8nClient.getWorkflow(workflowId);
    return workflow?.name ?? workflowId;
  } catch {
    return workflowId;
  }
}

function decryptWebhookAuth(row: TenantN8nSkillRow, ctx: SkillContext): string | undefined {
  if (!row.webhookAuthCiphertext || !row.webhookAuthNonce || !row.webhookAuthKeyId) {
    return undefined;
  }

  if (!ctx.encryptionKey) {
    throw new Error("encryption key is required for n8n webhook auth");
  }

  return decryptSecret(
    {
      ciphertext: row.webhookAuthCiphertext,
      nonce: row.webhookAuthNonce,
      keyId: row.webhookAuthKeyId
    },
    ctx.encryptionKey
  );
}

async function parseWebhookResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
