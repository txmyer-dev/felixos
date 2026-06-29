import { headers } from "next/headers";

import { tenantSlugHeader } from "../../lib/tenant";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const headerStore = await headers();
  const params = await searchParams;
  const tenantSlug = headerStore.get(tenantSlugHeader) ?? "demo";

  return (
    <main className="login-shell">
      <form className="login-panel" action="/api/auth/login" method="post">
        <div>
          <p className="eyebrow">{tenantSlug}</p>
          <h1>FelixOS</h1>
        </div>
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <label>
          Code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" />
        </label>
        <label>
          Recovery code
          <input name="recoveryCode" autoComplete="off" />
        </label>
        {params.error ? <p className="form-error">Unable to sign in.</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
