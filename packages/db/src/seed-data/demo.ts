export const demoTenant = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "demo",
  name: "FelixOS Demo MSP",
  status: "dormant" as const,
  isDemo: true
};

const northstarAccount = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Northstar Dental Group",
  lifecycleStage: "client" as const
};

const blueRidgeAccount = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Blue Ridge Architecture",
  lifecycleStage: "prospect" as const
};

const harborAccount = {
  id: "00000000-0000-4000-8000-000000000103",
  name: "Harbor Light Legal",
  lifecycleStage: "former_client" as const
};

export const demoAccounts = [northstarAccount, blueRidgeAccount, harborAccount];

const northstarContact = {
  id: "00000000-0000-4000-8000-000000000201",
  accountId: northstarAccount.id,
  name: "Avery Chen",
  email: "avery.chen@example.invalid",
  phone: "555-0101",
  role: "Practice Manager"
};

const blueRidgeContact = {
  id: "00000000-0000-4000-8000-000000000202",
  accountId: blueRidgeAccount.id,
  name: "Mina Patel",
  email: "mina.patel@example.invalid",
  phone: "555-0102",
  role: "Principal"
};

export const demoContacts = [northstarContact, blueRidgeContact];

export const demoDeals = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    accountId: blueRidgeAccount.id,
    name: "Managed endpoint rollout",
    stage: "proposal" as const,
    valueCents: 4200000
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    accountId: northstarAccount.id,
    name: "Quarterly security refresh",
    stage: "qualified" as const,
    valueCents: 1200000
  }
];

export const demoInteractions = [
  {
    id: "00000000-0000-4000-8000-000000000401",
    accountId: northstarAccount.id,
    contactId: northstarContact.id,
    kind: "meeting" as const,
    occurredAt: new Date("2026-06-15T14:00:00.000Z"),
    summary: "Reviewed backup posture and agreed to rotate recovery contacts."
  },
  {
    id: "00000000-0000-4000-8000-000000000402",
    accountId: blueRidgeAccount.id,
    contactId: blueRidgeContact.id,
    kind: "email" as const,
    occurredAt: new Date("2026-06-20T17:30:00.000Z"),
    summary: "Sent proposal follow-up with onboarding timeline."
  }
];
