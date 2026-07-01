import Link from "next/link";

import { Button } from "../../../../components/ui/button";

export default function AccountNotFound() {
  return (
    <div className="max-w-xl">
      <p className="eyebrow">Account</p>
      <h1 className="mb-3 text-2xl font-semibold">Account not found</h1>
      <p className="mb-5 text-sm text-muted">That account is not available for this tenant.</p>
      <Button asChild>
        <Link href="/accounts">Back to accounts</Link>
      </Button>
    </div>
  );
}
