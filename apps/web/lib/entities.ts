import "server-only";

import type { Account, Contact, Deal, Interaction } from "@felixos/shared-types";

import { apiFetch } from "./api";

export type AccountDetail = {
  account: Account;
  contacts: Contact[];
  deals: Deal[];
  interactions: Interaction[];
};

export async function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>("/entities");
}

export async function fetchAccount(id: string): Promise<Account> {
  return apiFetch<Account>(`/entities/${id}`);
}

export async function fetchAccountDetail(id: string): Promise<AccountDetail> {
  const [account, contacts, deals, interactions] = await Promise.all([
    fetchAccount(id),
    apiFetch<Contact[]>("/contacts"),
    apiFetch<Deal[]>("/deals"),
    apiFetch<Interaction[]>("/interactions")
  ]);

  return {
    account,
    contacts: contacts.filter((contact) => contact.accountId === id),
    deals: deals.filter((deal) => deal.accountId === id),
    interactions: interactions.filter((interaction) => interaction.accountId === id)
  };
}
