-- Greyloch Month-End Close — initial schema
-- D1 / SQLite. See build spec section 3.

-- Identity + global capability ceiling.
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,        -- must match the email Access passes
  name         TEXT NOT NULL,
  system_role  TEXT NOT NULL DEFAULT 'staff'
               CHECK (system_role IN ('admin','staff','viewer')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Master checklist. Edited rarely, by admins. The source for monthly spawns.
CREATE TABLE task_templates (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  category             TEXT,               -- e.g. 'Cash','Payroll','Inventory'
  description          TEXT,
  default_preparer_id  INTEGER REFERENCES users(id),
  default_reviewer_id  INTEGER REFERENCES users(id),
  sequence             INTEGER NOT NULL DEFAULT 0,   -- display order
  requires_review      INTEGER NOT NULL DEFAULT 1,
  active               INTEGER NOT NULL DEFAULT 1
);

-- One monthly close cycle.
CREATE TABLE close_periods (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  period            TEXT NOT NULL UNIQUE,   -- 'YYYY-MM', e.g. '2026-06'
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','closed')),
  target_close_date TEXT,
  opened_by         INTEGER REFERENCES users(id),
  opened_at         TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by         INTEGER REFERENCES users(id),
  closed_at         TEXT
);

-- Task instances: one row per template per period (spawned when a period opens).
CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id       INTEGER NOT NULL REFERENCES close_periods(id),
  template_id     INTEGER REFERENCES task_templates(id),
  name            TEXT NOT NULL,            -- copied from template; editable
  category        TEXT,
  preparer_id     INTEGER REFERENCES users(id),
  reviewer_id     INTEGER REFERENCES users(id),
  requires_review INTEGER NOT NULL DEFAULT 1,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN
                    ('not_started','in_progress','prepared','reviewed','reopened')),
  prepared_by     INTEGER REFERENCES users(id),
  prepared_at     TEXT,
  reviewed_by     INTEGER REFERENCES users(id),
  reviewed_at     TEXT,
  notes           TEXT,
  UNIQUE(period_id, template_id)
);

-- Append-only audit trail + collaboration feed.
CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER REFERENCES tasks(id),
  period_id  INTEGER REFERENCES close_periods(id),
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,   -- 'created','status_change','comment','assigned','reopened'
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_period       ON tasks(period_id);
CREATE INDEX idx_tasks_preparer     ON tasks(preparer_id);
CREATE INDEX idx_tasks_reviewer     ON tasks(reviewer_id);
CREATE INDEX idx_activity_task      ON activity_log(task_id);
CREATE INDEX idx_activity_period    ON activity_log(period_id);
CREATE INDEX idx_templates_sequence ON task_templates(sequence);
