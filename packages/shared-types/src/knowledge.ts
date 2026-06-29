import type { AccountId, TenantScoped } from "./entities.js";

export type RawSourceId = string;
export type DistilledItemId = string;

export type KnowledgeSourceType = "email" | "slack" | "transcript" | "youtube" | "doc" | "note";

export type DistilledItemType = "fact" | "decision" | "action";

export type DistilledItemStatus = "pending" | "accepted" | "rejected" | "corrected";

export type RawSourceView = TenantScoped & {
  id: RawSourceId;
  entityId: AccountId | null;
  sourceType: KnowledgeSourceType;
  content: string;
  metadata: unknown | null;
  createdAt: string;
};

export type DistilledItemView = TenantScoped & {
  id: DistilledItemId;
  sourceId: RawSourceId;
  entityId: AccountId | null;
  isGlobal: boolean;
  itemType: DistilledItemType;
  content: string;
  status: DistilledItemStatus;
  correctionText: string | null;
  embeddingModel: string | null;
  createdAt: string;
  updatedAt: string;
};
