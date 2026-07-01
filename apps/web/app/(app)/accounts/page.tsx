import Link from "next/link";

import { Badge } from "../../../components/ui/badge";
import { EmptyState } from "../../../components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../components/ui/table";
import { fetchAccounts } from "../../../lib/entities";

export default async function AccountsPage() {
  const accounts = await fetchAccounts();

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">FelixOS</p>
        <h1 className="mb-1 text-2xl font-semibold">Accounts</h1>
        <p className="mb-0 max-w-2xl text-sm text-muted">
          Client and prospect records on the entity spine.
        </p>
      </header>

      {accounts.length === 0 ? (
        <EmptyState title="No accounts yet" description="The demo seed creates starter accounts." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <Badge>{account.lifecycleStage.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      className="text-sm font-medium text-primary"
                      href={`/accounts/${account.id}`}
                    >
                      Drill in
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
