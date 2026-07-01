import type { ReactNode } from "react";

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold uppercase text-muted">{title}</h2>
      {children}
    </section>
  );
}
