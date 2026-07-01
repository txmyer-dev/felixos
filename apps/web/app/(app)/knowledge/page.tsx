import { reviewKnowledgeAction } from "../actions";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../components/ui/table";
import { fetchKnowledgeItems } from "../../../lib/knowledge";

export default async function KnowledgePage() {
  const pending = await fetchKnowledgeItems({ status: "pending", limit: 25 });

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">Knowledge</p>
        <h1 className="mb-1 text-2xl font-semibold">Review distilled items</h1>
        <p className="mb-0 max-w-2xl text-sm text-muted">
          Accept, correct, or reject pending distillations without leaving the list.
        </p>
      </header>

      {pending.items.length === 0 ? (
        <EmptyState
          title="No pending knowledge"
          description="New distillations will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="w-1/2">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge>{item.itemType}</Badge>
                      <span className="text-xs text-muted">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mb-0 text-sm">{item.content}</p>
                  </TableCell>
                  <TableCell>{item.entityId ? "Account" : "Global"}</TableCell>
                  <TableCell>
                    <form action={reviewKnowledgeAction} className="grid min-w-72 gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <textarea
                        className="min-h-16 rounded-md border border-border-strong bg-background p-2 text-sm"
                        name="correctionText"
                        placeholder="Correction text"
                      />
                      <div className="flex gap-2">
                        <Button name="status" size="sm" type="submit" value="accepted">
                          Accept
                        </Button>
                        <Button
                          name="status"
                          size="sm"
                          type="submit"
                          value="corrected"
                          variant="secondary"
                        >
                          Correct
                        </Button>
                        <Button
                          name="status"
                          size="sm"
                          type="submit"
                          value="rejected"
                          variant="ghost"
                        >
                          Reject
                        </Button>
                      </div>
                    </form>
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
