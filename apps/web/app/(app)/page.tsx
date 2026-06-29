import { fetchAccounts } from "../../lib/api";

export default async function HomePage() {
  const accounts = await fetchAccounts();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FelixOS</p>
          <h1>Accounts</h1>
        </div>
      </header>
      <section className="account-list" aria-label="Accounts">
        {accounts.length === 0 ? (
          <p className="empty-state">No accounts available.</p>
        ) : (
          accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <div>
                <h2>{account.name}</h2>
                <p>{account.lifecycleStage.replace("_", " ")}</p>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
