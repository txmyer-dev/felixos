import type { HTMLAttributes, TableHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-border text-left", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border", className)} {...props} />;
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <th
      className={cn("h-10 px-3 text-xs font-semibold uppercase text-muted", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <td className={cn("px-3 py-3 align-top", className)} {...props} />;
}
