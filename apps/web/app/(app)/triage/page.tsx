import Link from "next/link";

import { Badge } from "../../../components/ui/badge";
import { EmptyState } from "../../../components/ui/empty-state";
import { fetchTriageItems } from "../../../lib/triage";

export default async function TriagePage() {
  const items = await fetchTriageItems();

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">Triage</p>
        <h1 className="mb-1 text-2xl font-semibold">Agent-ranked queue</h1>
        <p className="mb-0 max-w-2xl text-sm text-muted">
          A distinct queue across pending approvals and failed automations.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing to triage"
          description="Later capture skills will fill this queue."
        />
      ) : (
        <div className="grid gap-3">
          {items.map((entry) =>
            entry.kind === "n8n" ? (
              <article
                className="rounded-md border border-border bg-surface p-4"
                key={entry.item.executionId}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="danger">n8n</Badge>
                  <span className="text-xs text-muted">
                    {new Date(entry.item.failedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mb-2 text-sm font-medium">{entry.item.workflowName}</p>
                <a
                  className="text-sm font-medium text-primary"
                  href={entry.item.n8nUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Investigate in n8n
                </a>
              </article>
            ) : (
              <article
                className="rounded-md border border-border bg-surface p-4"
                key={entry.item.id}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="warning">{entry.item.skillName}</Badge>
                  <span className="text-xs text-muted">
                    {new Date(entry.item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mb-2 text-sm">
                  {entry.item.agentContext ?? "Draft awaiting review."}
                </p>
                {entry.item.targetEntityId ? (
                  <Link
                    className="text-sm font-medium text-primary"
                    href={`/accounts/${entry.item.targetEntityId}`}
                  >
                    Open account
                  </Link>
                ) : null}
              </article>
            )
          )}
        </div>
      )}
    </div>
  );
}
