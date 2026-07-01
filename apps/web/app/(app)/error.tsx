"use client";

import { Button } from "../../components/ui/button";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl">
      <p className="eyebrow">FelixOS</p>
      <h1 className="mb-3 text-2xl font-semibold">Something needs attention</h1>
      <p className="mb-5 text-sm text-muted">{error.message}</p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
