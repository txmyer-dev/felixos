import { acknowledgeN8nAction } from "../actions";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../components/ui/table";
import { fetchExecutions, fetchNeedsAttention, fetchWorkflows } from "../../../lib/n8n";

export default async function N8nPage() {
  const [workflows, executions, needsAttention] = await Promise.all([
    fetchWorkflows(),
    fetchExecutions(),
    fetchNeedsAttention()
  ]);

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">n8n</p>
        <h1 className="mb-1 text-2xl font-semibold">Workflow operations</h1>
        <p className="mb-0 max-w-2xl text-sm text-muted">
          Read-only workflow and execution visibility, with acknowledge for failed runs.
        </p>
      </header>

      <Tabs defaultValue="attention">
        <TabsList>
          <TabsTrigger value="attention">Needs attention</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4" value="attention">
          {needsAttention.length === 0 ? (
            <EmptyState title="No failed executions" />
          ) : (
            <div className="grid gap-3">
              {needsAttention.map((item) => (
                <article
                  className="rounded-md border border-border bg-surface p-4"
                  key={item.executionId}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="danger">failed</Badge>
                    <span className="text-xs text-muted">
                      {new Date(item.failedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mb-2 text-sm font-medium">{item.workflowName}</p>
                  <p className="mb-3 text-sm text-muted">{item.errorSummary}</p>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <a href={item.n8nUrl} rel="noreferrer" target="_blank">
                        Investigate
                      </a>
                    </Button>
                    <form action={acknowledgeN8nAction}>
                      <input type="hidden" name="id" value={item.executionId} />
                      <Button size="sm" type="submit" variant="ghost">
                        Acknowledge
                      </Button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-4" value="workflows">
          {workflows.items.length === 0 ? (
            <EmptyState title="No workflows returned" />
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.items.map((workflow) => (
                    <TableRow key={workflow.id}>
                      <TableCell className="font-medium">{workflow.name}</TableCell>
                      <TableCell>
                        <Badge tone={workflow.active ? "success" : "neutral"}>
                          {workflow.active ? "active" : "inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-4" value="executions">
          {executions.items.length === 0 ? (
            <EmptyState title="No executions returned" />
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.items.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell className="font-medium">
                        {execution.workflowName ?? execution.workflowId ?? execution.id}
                      </TableCell>
                      <TableCell>
                        <Badge>{execution.status ?? "unknown"}</Badge>
                      </TableCell>
                      <TableCell>
                        {execution.startedAt
                          ? new Date(execution.startedAt).toLocaleString()
                          : "Unknown"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
