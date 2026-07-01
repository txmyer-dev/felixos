"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../../lib/utils";

const navItems = [
  { href: "/", label: "Today" },
  { href: "/accounts", label: "Accounts" },
  { href: "/triage", label: "Triage" },
  { href: "/n8n", label: "n8n" },
  { href: "/knowledge", label: "Knowledge" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-border bg-surface px-4 py-5">
      <div className="mb-7">
        <p className="mb-1 text-xs font-semibold uppercase text-muted">FelixOS</p>
        <p className="mb-0 text-lg font-semibold">Operator</p>
      </div>
      <nav className="grid gap-1" aria-label="Primary">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface-muted"
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
