-- Record-Management Agent (Phase 6) U1: reversible audit trail on pending_actions.
-- Adds structured result/reversal capture and a `reversed` status so agent-performed
-- entity mutations can be undone from Today. No new table -> pending_actions already
-- has RLS enabled + forced (migration 0005) and USAGE on pending_action_status is
-- already granted, so no accompanying RLS/grant migration is needed.

ALTER TYPE pending_action_status ADD VALUE IF NOT EXISTS 'reversed';

ALTER TABLE pending_actions
  ADD COLUMN result jsonb,
  ADD COLUMN reversal jsonb,
  ADD COLUMN reversed_at timestamptz;
