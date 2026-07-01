import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-border-strong bg-surface px-4 py-5">
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mb-0 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
