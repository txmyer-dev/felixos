import { notFound } from "next/navigation";

import { DetailSection } from "../../../../components/drill-in/section";
import { Badge } from "../../../../components/ui/badge";
import { EmptyState } from "../../../../components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/ui/table";
import { fetchAccountDetail } from "../../../../lib/entities";

export default async function AccountDrillInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try {
    detail = await fetchAccountDetail(id);
  } catch {
    notFound();
  }

  return (
    <div className="grid gap-7">
      <header>
        <p className="eyebrow">Account</p>
        <div className="flex items-center gap-3">
          <h1 className="mb-0 text-2xl font-semibold">{detail.account.name}</h1>
          <Badge>{detail.account.lifecycleStage.replace("_", " ")}</Badge>
        </div>
      </header>

      <div className="grid gap-7">
        <DetailSection title="Contacts">
          {detail.contacts.length === 0 ? (
            <EmptyState title="No contacts" />
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <Table>
                <TableBody>
                  {detail.contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell>{contact.role ?? "No role"}</TableCell>
                      <TableCell>{contact.email ?? "No email"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Deals">
          {detail.deals.length === 0 ? (
            <EmptyState title="No active deals" />
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.deals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.name}</TableCell>
                      <TableCell>
                        <Badge>{deal.stage}</Badge>
                      </TableCell>
                      <TableCell>
                        {deal.valueCents === null
                          ? "Unpriced"
                          : new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 0
                            }).format(deal.valueCents / 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Interactions">
          {detail.interactions.length === 0 ? (
            <EmptyState title="No interactions" />
          ) : (
            <div className="grid gap-2">
              {detail.interactions.map((interaction) => (
                <article
                  className="rounded-md border border-border bg-surface p-4"
                  key={interaction.id}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>{interaction.kind}</Badge>
                    <span className="text-xs text-muted">
                      {new Date(interaction.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mb-0 text-sm">{interaction.summary}</p>
                </article>
              ))}
            </div>
          )}
        </DetailSection>

        <div className="grid grid-cols-2 gap-4">
          <EmptyState title="Email" description="Email capture has not landed yet." />
          <EmptyState title="Slack" description="Slack capture has not landed yet." />
          <EmptyState title="Meetings" description="Meeting capture has not landed yet." />
          <EmptyState title="Tasks" description="Task management is deferred." />
        </div>
      </div>
    </div>
  );
}
