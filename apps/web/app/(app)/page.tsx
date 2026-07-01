import Link from "next/link";

import { MeetingsEmpty } from "../../components/command-center/meetings-empty";
import { PendingItem } from "../../components/command-center/pending-item";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { fetchPendingActions } from "../../lib/agent";
import { fetchKnowledgeItems } from "../../lib/knowledge";
import { fetchNeedsAttention } from "../../lib/n8n";
import { acknowledgeN8nAction } from "./actions";

export default async function CommandCenterPage() {
  const [pendingActions, executedActions, needsAttention, recentKnowledge] = await Promise.all([
    fetchPendingActions("pending"),
    fetchPendingActions("executed"),
    fetchNeedsAttention(),
    fetchKnowledgeItems({ status: "accepted", limit: 5 })
  ]);

  return (
    <div className="grid gap-7">
      <header>
        <p className="eyebrow">Command-center</p>
        <h1 className="mb-1 text-2xl font-semibold">Today</h1>
        <p className="mb-0 max-w-2xl text-sm text-muted">
          Items that need Tony, what the agent already handled, meetings, and fresh knowledge.
        </p>
      </header>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted">Needs you</h2>
        {pendingActions.length === 0 && needsAttention.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Draft approvals and failed automations appear here."
          />
        ) : (
          <div className="grid gap-3">
            {pendingActions.map((action) => (
              <PendingItem action={action} key={action.id} />
            ))}
            {needsAttention.map((item) => (
              <article
                className="rounded-md border border-border bg-surface p-4"
                key={item.executionId}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="danger">n8n failed</Badge>
                  <span className="text-xs text-muted">
                    {new Date(item.failedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mb-3 text-sm font-medium">{item.workflowName}</p>
                <p className="mb-3 text-sm text-muted">{item.errorSummary}</p>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <a href={item.n8nUrl} rel="noreferrer" target="_blank">
                      Investigate
                    </a>
                  </Button>
                  <form action={acknowledgeN8nAction}>
                    <input type="hidden" name="id" value={item.executionId} />
                    <Button size="sm" type="submit" variant="ghost">
                      Acknowledge
                    </Button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted">Act and log</h2>
        {executedActions.length === 0 ? (
          <EmptyState
            title="No logged automations"
            description="Executed draft-and-wait actions appear here."
          />
        ) : (
          <div className="grid gap-2">
            {executedActions.map((action) => (
              <article
                className="flex items-center justify-between rounded-md border border-border bg-surface p-4"
                key={action.id}
              >
                <div>
                  <Badge tone="success">{action.skillName}</Badge>
                  <p className="mb-0 mt-2 text-sm">{action.agentContext ?? "Action executed."}</p>
                </div>
                {action.targetEntityId ? (
                  <Link
                    className="text-sm font-medium text-primary"
                    href={`/accounts/${action.targetEntityId}`}
                  >
                    Open account
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted">Meetings</h2>
        <MeetingsEmpty />
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted">Fresh knowledge</h2>
        {recentKnowledge.items.length === 0 ? (
          <EmptyState
            title="No accepted knowledge yet"
            description="Accepted distilled items appear here."
          />
        ) : (
          <div className="grid gap-2">
            {recentKnowledge.items.map((item) => (
              <article className="rounded-md border border-border bg-surface p-4" key={item.id}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge>{item.itemType}</Badge>
                  {item.entityId ? (
                    <Link
                      className="text-xs font-medium text-primary"
                      href={`/accounts/${item.entityId}`}
                    >
                      Open account
                    </Link>
                  ) : null}
                </div>
                <p className="mb-0 text-sm">{item.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
