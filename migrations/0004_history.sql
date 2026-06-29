-- Cutover from Monday: backfill April & May 2026 (closed) and June 2026 (open,
-- in progress) from the recurring templates. The monthly Monday boards are
-- instances of the template list, so we spawn each period's tasks from
-- task_templates (copying name/category/assignees/requires_review) and set the
-- status to match Monday: April/May fully complete; June complete except the
-- tasks still open on the Monday board as of the cutover.
--
-- due_date = the template day-of-month (sequence) within the period, clamped to
-- the month length. Timestamps are approximate (Monday doesn't expose per-task
-- sign-off history).

INSERT INTO close_periods (period, status, target_close_date, opened_by, opened_at, closed_by, closed_at) VALUES
  ('2026-04', 'closed', '2026-05-10', 1, '2026-04-01 09:00:00', 1, '2026-05-08 17:00:00'),
  ('2026-05', 'closed', '2026-06-10', 1, '2026-05-01 09:00:00', 1, '2026-06-09 17:00:00'),
  ('2026-06', 'open',   '2026-07-10', 1, '2026-06-01 09:00:00', NULL, NULL);

-- Helper expression note: clamp day to month length via the month's last day.

-- April (closed) — all tasks complete.
INSERT INTO tasks
  (period_id, template_id, name, category, preparer_id, reviewer_id, requires_review,
   due_date, status, prepared_by, prepared_at, reviewed_by, reviewed_at)
SELECT p.id, t.id, t.name, t.category, t.default_preparer_id, t.default_reviewer_id, t.requires_review,
       printf('%s-%02d', p.period,
              min(t.sequence, CAST(strftime('%d', date(p.period || '-01', '+1 month', '-1 day')) AS INTEGER))),
       CASE WHEN t.requires_review = 1 THEN 'reviewed' ELSE 'prepared' END,
       t.default_preparer_id, p.period || '-08 12:00:00',
       CASE WHEN t.requires_review = 1 THEN t.default_reviewer_id ELSE NULL END,
       CASE WHEN t.requires_review = 1 THEN p.period || '-09 12:00:00' ELSE NULL END
  FROM task_templates t CROSS JOIN close_periods p
 WHERE t.active = 1 AND p.period = '2026-04';

-- May (closed) — all tasks complete.
INSERT INTO tasks
  (period_id, template_id, name, category, preparer_id, reviewer_id, requires_review,
   due_date, status, prepared_by, prepared_at, reviewed_by, reviewed_at)
SELECT p.id, t.id, t.name, t.category, t.default_preparer_id, t.default_reviewer_id, t.requires_review,
       printf('%s-%02d', p.period,
              min(t.sequence, CAST(strftime('%d', date(p.period || '-01', '+1 month', '-1 day')) AS INTEGER))),
       CASE WHEN t.requires_review = 1 THEN 'reviewed' ELSE 'prepared' END,
       t.default_preparer_id, p.period || '-08 12:00:00',
       CASE WHEN t.requires_review = 1 THEN t.default_reviewer_id ELSE NULL END,
       CASE WHEN t.requires_review = 1 THEN p.period || '-09 12:00:00' ELSE NULL END
  FROM task_templates t CROSS JOIN close_periods p
 WHERE t.active = 1 AND p.period = '2026-05';

-- June (open) — start everything "complete", then reopen the tasks still in
-- flight on the Monday board so the team finishes them in the app.
INSERT INTO tasks
  (period_id, template_id, name, category, preparer_id, reviewer_id, requires_review,
   due_date, status, prepared_by, prepared_at, reviewed_by, reviewed_at)
SELECT p.id, t.id, t.name, t.category, t.default_preparer_id, t.default_reviewer_id, t.requires_review,
       printf('%s-%02d', p.period,
              min(t.sequence, CAST(strftime('%d', date(p.period || '-01', '+1 month', '-1 day')) AS INTEGER))),
       CASE WHEN t.requires_review = 1 THEN 'reviewed' ELSE 'prepared' END,
       t.default_preparer_id, p.period || '-08 12:00:00',
       CASE WHEN t.requires_review = 1 THEN t.default_reviewer_id ELSE NULL END,
       CASE WHEN t.requires_review = 1 THEN p.period || '-09 12:00:00' ELSE NULL END
  FROM task_templates t CROSS JOIN close_periods p
 WHERE t.active = 1 AND p.period = '2026-06';

-- Tasks still open on the Monday June board at cutover -> reset to not_started.
UPDATE tasks
   SET status = 'not_started', prepared_by = NULL, prepared_at = NULL,
       reviewed_by = NULL, reviewed_at = NULL
 WHERE period_id = (SELECT id FROM close_periods WHERE period = '2026-06')
   AND name IN (
     'Enter Cap One transactions up until month end (after receiving info from Austin)',
     'Enter Blue Cross Bill (current month)',
     'United Heritage (not on autopay) (20)',
     'Aflac (on autopay) enter bill and payment in QB, update tracker (18)',
     'Colonial Life (on autopay) enter bill and payment in QB, update tracker (19)',
     'Record Asset Mgmt Fee (last day of the month) - paid out on next check run',
     'Export Allmoxy AR Summary and Save to File (as close to month end as possible)',
     'Export order detail from Allmoxy for FG reference (as close to month end as possible)',
     'Check Run (date as the first day of next month) (12)',
     'Get Store Data as of month end',
     'Pay Nice Healthcare',
     'Update Nice Healthcare',
     'Reconcile Cap One to Monthly Statement',
     'Check AR Collections (10th)',
     'Check AR Collections (25th)',
     'Send out inventory count sheets and emails',
     'Approve reimbursements as of ME'
   );

INSERT INTO activity_log (period_id, user_id, action, detail)
SELECT id, 1, 'created', 'Imported from Monday at cutover.' FROM close_periods
 WHERE period IN ('2026-04', '2026-05', '2026-06');
