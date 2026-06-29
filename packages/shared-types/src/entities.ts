import type { TenantId } from "./tenant.js";

export type AccountId = string;
export type ContactId = string;
export type DealId = string;
export type InteractionId = string;

export type AccountLifecycleStage = "prospect" | "client" | "former_client";

export type DealStage = "new" | "qualified" | "proposal" | "won" | "lost";

export type InteractionKind = "email" | "meeting" | "call" | "note" | "task" | "other";

export type TenantScoped = {
  tenantId: TenantId;
};

export type Account = TenantScoped & {
  id: AccountId;
  name: string;
  lifecycleStage: AccountLifecycleStage;
  createdAt: string;
  updatedAt: string;
};

export type Entity = Account;

export type Contact = TenantScoped & {
  id: ContactId;
  accountId: AccountId;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Deal = TenantScoped & {
  id: DealId;
  accountId: AccountId;
  name: string;
  stage: DealStage;
  valueCents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Interaction = TenantScoped & {
  id: InteractionId;
  accountId: AccountId;
  contactId: ContactId | null;
  kind: InteractionKind;
  occurredAt: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};
