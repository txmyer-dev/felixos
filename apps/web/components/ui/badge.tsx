import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
};

const tones = {
  neutral: "border-border bg-surface text-muted-foreground",
  success: "border-primary/30 bg-primary/10 text-primary",
  warning: "border-border-strong bg-surface-muted text-muted-foreground",
  danger: "border-danger/30 bg-danger/10 text-danger"
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
