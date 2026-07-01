import Link from "next/link";

import type { PendingActionView } from "@felixos/shared-types";

import { approveAction, editAction, rejectAction } from "../../app/(app)/actions";
import { pendingActionText } from "../../lib/agent";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export function PendingItem({ action }: { action: PendingActionView }) {
  return (
    <article className="grid gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="warning">{action.skillName}</Badge>
            <span className="text-xs text-muted">
              {new Date(action.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mb-0 text-sm">{pendingActionText(action)}</p>
        </div>
        {action.targetEntityId ? (
          <Link
            className="text-sm font-medium text-primary"
            href={`/accounts/${action.targetEntityId}`}
          >
            Open account
          </Link>
        ) : null}
      </div>
      <form action={editAction} className="grid gap-2">
        <input type="hidden" name="id" value={action.id} />
        <textarea
          className="min-h-20 rounded-md border border-border-strong bg-background p-2 text-sm"
          name="text"
          defaultValue={pendingActionText(action)}
        />
        <div className="flex gap-2">
          <Button size="sm" type="submit" variant="secondary">
            Save edit
          </Button>
          <Button formAction={approveAction} name="id" value={action.id} size="sm" type="submit">
            Approve
          </Button>
          <Button
            formAction={rejectAction}
            name="id"
            value={action.id}
            size="sm"
            type="submit"
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      </form>
    </article>
  );
}
