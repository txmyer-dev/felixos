import { contacts, entities, runWithTenantContext, type ScopedDatabaseClient } from "@felixos/db";
import { and, eq } from "drizzle-orm";

import type { NeedsClarification } from "@felixos/skills";

/**
 * Resolves a natural-language reference ("Acme", "the Acme deal owner") to a
 * tenant-scoped entity or contact id. All reads go through the ALS-scoped,
 * RLS-enforced client, so a resolver run for tenant A can never surface tenant
 * B rows. Skills use this in `execute` to either resolve directly or return a
 * `NeedsClarification` when the reference is ambiguous.
 */

export type RefCandidate = {
  id: string;
  name: string;
  detail?: string;
};

export type RefResolution =
  | { kind: "resolved"; id: string; name: string }
  | { kind: "ambiguous"; candidates: RefCandidate[] }
  | { kind: "none" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Pure classification over an already-tenant-scoped candidate set. Exact
 * case-insensitive name match wins when unique; multiple exact or any
 * substring matches are ambiguous; a UUID that matches a candidate id
 * resolves directly. No match returns `none` (the caller decides create-new).
 */
export function classifyRef(ref: string, candidates: RefCandidate[]): RefResolution {
  const trimmed = ref.trim();
  if (!trimmed) return { kind: "none" };

  if (isUuid(trimmed)) {
    const byId = candidates.find((c) => c.id === trimmed);
    if (byId) return { kind: "resolved", id: byId.id, name: byId.name };
  }

  const lower = trimmed.toLowerCase();
  const exact = candidates.filter((c) => c.name.toLowerCase() === lower);
  if (exact.length === 1) return { kind: "resolved", id: exact[0]!.id, name: exact[0]!.name };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const fuzzy = candidates.filter((c) => c.name.toLowerCase().includes(lower));
  if (fuzzy.length > 0) return { kind: "ambiguous", candidates: fuzzy };

  return { kind: "none" };
}

/**
 * Bridge a RefResolution into what a plan/commit skill's `execute` returns:
 * a resolved `{ id }`, or a `NeedsClarification` the trust ladder surfaces
 * without writing. `noun` labels the question; `idKey` is the option field the
 * follow-up agent turn reads back (e.g. "accountId") so the stateless run stays
 * self-contained.
 */
export function resolveOrClarify(
  ref: string,
  resolution: RefResolution,
  noun: string,
  idKey: string
): { id: string } | NeedsClarification {
  if (resolution.kind === "resolved") {
    return { id: resolution.id };
  }
  if (resolution.kind === "ambiguous") {
    return {
      kind: "needs-clarification",
      question: `Which ${noun} did you mean by "${ref}"?`,
      options: resolution.candidates.map((c) => ({
        label: c.detail ? `${c.name} (${c.detail})` : c.name,
        [idKey]: c.id
      }))
    };
  }
  return {
    kind: "needs-clarification",
    question: `No ${noun} matches "${ref}". Reply with the exact ${noun} name, or create it first.`,
    options: []
  };
}

export async function resolveEntityRef(opts: {
  ref: string;
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
}): Promise<RefResolution> {
  const rows = await runWithTenantContext(opts.tenantId, () =>
    opts.scopedDb.transaction((tx) =>
      tx
        .select({ id: entities.id, name: entities.name, stage: entities.lifecycleStage })
        .from(entities)
        // RLS already scopes this to the tenant; the explicit predicate matches
        // resolveContactRef and the codebase's defense-in-depth convention.
        .where(eq(entities.tenantId, opts.tenantId))
    )
  );
  return classifyRef(
    opts.ref,
    rows.map((r) => ({ id: r.id, name: r.name, detail: r.stage }))
  );
}

export async function resolveContactRef(opts: {
  ref: string;
  tenantId: string;
  scopedDb: ScopedDatabaseClient;
  accountId?: string;
}): Promise<RefResolution> {
  const rows = await runWithTenantContext(opts.tenantId, () =>
    opts.scopedDb.transaction((tx) =>
      tx
        .select({ id: contacts.id, name: contacts.name, role: contacts.role })
        .from(contacts)
        .where(
          opts.accountId
            ? and(eq(contacts.tenantId, opts.tenantId), eq(contacts.accountId, opts.accountId))
            : eq(contacts.tenantId, opts.tenantId)
        )
    )
  );
  return classifyRef(
    opts.ref,
    rows.map((r) => ({ id: r.id, name: r.name, ...(r.role ? { detail: r.role } : {}) }))
  );
}
