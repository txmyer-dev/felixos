"use server";

import { revalidatePath } from "next/cache";

import type { DistilledItemStatus } from "@felixos/shared-types";

import { approvePendingAction, editPendingAction, rejectPendingAction } from "../../lib/agent";
import { reviewKnowledgeItem } from "../../lib/knowledge";
import { acknowledgeExecution } from "../../lib/n8n";

export async function approveAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await approvePendingAction(id);
  revalidatePath("/");
}

export async function rejectAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await rejectPendingAction(id);
  revalidatePath("/");
}

export async function editAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "");
  await editPendingAction(id, text);
  revalidatePath("/");
}

export async function acknowledgeN8nAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await acknowledgeExecution(id);
  revalidatePath("/");
  revalidatePath("/n8n");
  revalidatePath("/triage");
}

export async function reviewKnowledgeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as DistilledItemStatus;
  const correctionText = String(formData.get("correctionText") ?? "").trim();
  await reviewKnowledgeItem(id, {
    status,
    ...(correctionText ? { correctionText } : {})
  });
  revalidatePath("/");
  revalidatePath("/knowledge");
}
