-- Add a unified terminal "completed" status. Both paths end here:
--   * requires_review = 1: ... -> prepared -> (reviewer signs off) -> completed
--   * requires_review = 0: ... -> (preparer checks off) -> completed
-- SQLite can't alter a CHECK constraint in place, so rebuild the tasks table.
-- Existing data is migrated: 'reviewed' -> 'completed', and any no-review
-- 'prepared' (which used to mean done) -> 'completed'.

PRAGMA defer_foreign_keys = true;

CREATE TABLE tasks_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id       INTEGER NOT NULL REFERENCES close_periods(id),
  template_id     INTEGER REFERENCES task_templates(id),
  name            TEXT NOT NULL,
  category        TEXT,
  preparer_id     INTEGER REFERENCES users(id),
  reviewer_id     INTEGER REFERENCES users(id),
  requires_review INTEGER NOT NULL DEFAULT 1,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN
                    ('not_started','in_progress','prepared','reviewed','completed','reopened')),
  prepared_by     INTEGER REFERENCES users(id),
  prepared_at     TEXT,
  reviewed_by     INTEGER REFERENCES users(id),
  reviewed_at     TEXT,
  notes           TEXT,
  blocked         INTEGER NOT NULL DEFAULT 0,
  blocked_reason  TEXT,
  UNIQUE(period_id, template_id)
);

INSERT INTO tasks_new
  (id, period_id, template_id, name, category, preparer_id, reviewer_id,
   requires_review, due_date, status, prepared_by, prepared_at, reviewed_by,
   reviewed_at, notes, blocked, blocked_reason)
SELECT
   id, period_id, template_id, name, category, preparer_id, reviewer_id,
   requires_review, due_date,
   CASE
     WHEN status = 'reviewed' THEN 'completed'
     WHEN status = 'prepared' AND requires_review = 0 THEN 'completed'
     ELSE status
   END,
   prepared_by, prepared_at, reviewed_by, reviewed_at, notes, blocked, blocked_reason
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_period   ON tasks(period_id);
CREATE INDEX idx_tasks_preparer ON tasks(preparer_id);
CREATE INDEX idx_tasks_reviewer ON tasks(reviewer_id);
