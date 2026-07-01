import { EmptyState } from "../ui/empty-state";

export function MeetingsEmpty() {
  return (
    <EmptyState
      title="No meeting feed yet"
      description="Meeting capture and prep are deferred until the capture backends land."
    />
  );
}
