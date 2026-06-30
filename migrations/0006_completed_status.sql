-- Add a unified terminal "completed" status. Both paths end here:
--   * requires_review = 1: ... -> prepared -> (reviewer signs off) -> completed
--   * requires_review = 0: ... -> (preparer checks off) -> completed
-- SQLite can't alter a CHECK constraint in place, so the tasks table is rebuilt.
--
-- D1 enforces foreign keys per-statement and does not honor
-- defer_foreign_keys across a multi-statement migration, so we can't simply
-- DROP tasks while activity_log references it. Instead: (1) rebuild activity_log
-- WITHOUT its FK to tasks (nothing references activity_log, so this is safe),
-- then (2) rebuild tasks (now nothing references it). No single statement ever
-- violates a constraint.

-- 1) Rebuild activity_log without the tasks foreign key (append-only audit log;
--    DB-level FK on task_id isn't needed — the app always writes valid ids).
CREATE TABLE activity_log_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER,
  period_id  INTEGER,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO activity_log_new (id, task_id, period_id, user_id, action, detail, created_at)
  SELECT id, task_id, period_id, user_id, action, detail, created_at FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_new RENAME TO activity_log;
CREATE INDEX idx_activity_task   ON activity_log(task_id);
CREATE INDEX idx_activity_period ON activity_log(period_id);

-- 2) Rebuild tasks with the new status CHECK and migrate existing rows:
--    'reviewed' -> 'completed'; no-review 'prepared' -> 'completed'.
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
