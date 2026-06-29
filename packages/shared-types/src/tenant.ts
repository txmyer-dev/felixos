export type TenantId = string;

export type TenantStatus = "active" | "dormant";

export type Tenant = {
  id: TenantId;
  slug: string;
  name: string;
  status: TenantStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantResolution = {
  tenantId: TenantId;
  slug: string;
  status: TenantStatus;
};
