-- A task can be flagged "blocked" (Monday's "Stuck") independently of its
-- prepare/review status, so people can surface stuck items without losing
-- their place in the workflow.
ALTER TABLE tasks ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
