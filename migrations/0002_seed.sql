-- Seed data, reconciled from the Monday "TEMPLATE Reoccurring Task List" board.
--
-- USERS: the month-end close team. Emails must match exactly what Cloudflare
-- Access / Entra ID sends. Ids are referenced by the templates below, so keep
-- this order.
--   1 Austin (admin)  2 Christina  3 Sydney  4 Sharon (reviewer)
INSERT INTO users (email, name, system_role) VALUES
  ('austin@greyloch.com',    'Austin Hall',    'admin'),
  ('christina@greyloch.com', 'Christina Cole', 'staff'),
  ('sydney@greyloch.com',    'Sydney Peel',    'staff'),
  ('sharon@greyloch.com',    'Sharon',         'staff');

-- TASK TEMPLATES: the recurring month-end checklist mirrored from Monday.
--   category   = NULL (the board has no categories; the app orders by day)
--   sequence   = Day of the Month the task is due (drives ordering + due date)
--   preparer   = Monday "Assignee"  (1 Austin, 2 Christina, 3 Sydney)
--   reviewer   = default "Reviewed by": Sharon (4) for Austin's tasks, else
--                Austin (1) — so preparer != reviewer and SoD is satisfiable.
--   requires_review = best-guess default (1 for entries/reconciliations/
--                reporting/payroll/tax; 0 for routine payments, utilities,
--                sends/exports). Toggle freely in the Templates editor.
--   "[C]" in a name = a step you already have a Cowork skill/automation for.
INSERT INTO task_templates
  (name, category, sequence, requires_review, default_preparer_id, default_reviewer_id) VALUES
  -- Day 1
  ('Amazon Entry (dated last day of the prior month)', NULL, 1, 1, 2, 1),
  ('Reconcile Ashley Glass', NULL, 1, 1, 2, 1),
  ('Reconcile Advanced Hardware', NULL, 1, 1, 2, 1),
  ('Send Sydney Capital One transactions as of the end of the month', NULL, 1, 0, 1, 4),
  ('2 X Draft WF Equipment Pmt (Autopay - one due on the 5th and one on the 10th) [C]', NULL, 1, 0, 1, 4),
  ('Draft Volvo Pmt (Autopay) [C]', NULL, 1, 0, 1, 4),
  ('Depr/Amort Entry', NULL, 1, 1, 1, 4),
  ('Federated Insurance (also create entry for expenses coming out of prepaid; update insurance tracker) (11) [C]', NULL, 1, 1, 1, 4),
  ('Greyloch Equipment Rent (from GCC to GLLC, record PMT in ZTIB, record in QB) (3)', NULL, 1, 1, 1, 4),
  ('Equipment Lease from Other Lessors (4 total - GCC) (4) [C]', NULL, 1, 1, 1, 4),
  ('Builders Interior Statement (14) [C]', NULL, 1, 1, 1, 4),
  ('Lewis Invoice Import (7) [C]', NULL, 1, 1, 1, 4),
  ('Cabdoor Invoice Import (6) [C]', NULL, 1, 1, 1, 4),
  ('Real and Personal Property Tax Accrual (also fund property tax reserve) (1 Entry) [C]', NULL, 1, 1, 1, 4),
  ('Inventory Count/Entry (remember to adjust FG, if necessary) [C]', NULL, 1, 1, 1, 4),
  ('Create VMI entry and reversal (26) [C]', NULL, 1, 1, 1, 4),
  ('Pay Chevron (bad late fees - due the 6th)', NULL, 1, 0, 1, 4),
  ('File Withholding and Sales Tax Return for GCC - prior month in TAP Idaho (27)', NULL, 1, 1, 1, 4),
  ('Reconcile IWP', NULL, 1, 1, 2, 1),
  ('Reconcile Hardware Resources', NULL, 1, 1, 2, 1),
  ('Reconcile Hafele', NULL, 1, 1, 2, 1),
  ('Reconcile Rugby', NULL, 1, 1, 2, 1),
  ('Update Nice Healthcare', NULL, 1, 0, 3, 1),
  ('Reconcile Sierra', NULL, 1, 1, 2, 1),
  ('Reconcile Stiles', NULL, 1, 1, 2, 1),
  ('Approve reimbursements as of ME', NULL, 1, 0, 3, 1),
  -- Day 2
  ('Enter Cap One transactions up until month end (after receiving info from Austin)', NULL, 2, 1, 3, 1),
  ('Reconcile various accounts (Account Recons 2026 folder)', NULL, 2, 1, 1, 4),
  ('Review recurring transactions (update titles) [C]', NULL, 2, 1, 1, 4),
  ('Bank Recs (remember GCC operating acct) (10)', NULL, 2, 1, 1, 4),
  ('UTILITIES: Idaho Power - Star Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Lumen Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Starlink Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Sparklight Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Intermountain Gas - Star Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Star Sewer and Water Bill', NULL, 2, 0, 2, 1),
  ('UTILITIES: Republic Services Bill', NULL, 2, 0, 2, 1),
  ('Reconcile Ramp Card', NULL, 2, 1, 1, 4),
  -- Day 5
  ('Make sure truck maintenance schedule is updated, and required maintenance is taking place', NULL, 5, 0, 1, 4),
  ('Close to Month End', NULL, 5, 0, 1, 4),
  ('Save Prior Month AR & AP Summary Report once GL is closed', NULL, 5, 0, 1, 4),
  ('Month end analytical review and finalization (aim for the 10th) (16)', NULL, 5, 1, 1, 4),
  ('Production Reporting [C]', NULL, 5, 1, 1, 4),
  ('Evaluate monthly Profit Sharing and send out email update (31) [C]', NULL, 5, 1, 1, 4),
  ('Update Sales Tracker (send support to everyone, tracker only to management) (28)', NULL, 5, 0, 1, 4),
  ('Send Out Timesheet Approval Email (Boomerang; review for new/terminated employees)', NULL, 5, 0, 1, 4),
  -- Day 6
  ('Run GCC Payroll (32)', NULL, 6, 1, 1, 4),
  ('Payroll Entry (1) (make replacement transfer into the payroll reserve after) [C]', NULL, 6, 1, 1, 4),
  -- Day 7
  ('Cabdoor Pmt (needs to be before the 10th) (6)', NULL, 7, 0, 1, 4),
  -- Day 9
  ('Rugby PMT (23)', NULL, 9, 0, 1, 4),
  ('Pay down Capital One Card (due 13th) (QB and Cap One Portal; transfer and schedule PMT)', NULL, 9, 0, 1, 4),
  -- Day 10
  ('Lewis (just pay on the website and mark paid in QB) (7)', NULL, 10, 0, 1, 4),
  ('BOA Reconcile and PMT (21)', NULL, 10, 1, 1, 4),
  ('Make sure Canon invoice is entered and paid (autopay - due the 20th)', NULL, 10, 0, 2, 1),
  ('Check AR Collections (10th)', NULL, 10, 0, 3, 1),
  -- Day 12
  ('Enter Blue Cross Bill (current month)', NULL, 12, 0, 2, 1),
  -- Day 14
  ('United Heritage (not on autopay) (20)', NULL, 14, 0, 2, 1),
  ('Check Run (12)', NULL, 14, 0, 1, 4),
  -- Day 15
  ('Intermountain AP Pmt (8) [C]', NULL, 15, 0, 1, 4),
  ('AHS AP Pmt (9) [C]', NULL, 15, 0, 1, 4),
  -- Day 18
  ('Reconcile Cap One to Monthly Statement', NULL, 18, 1, 3, 1),
  -- Day 20
  ('Draft WFB Debt Entry, Payments and Interest (5)', NULL, 20, 1, 1, 4),
  ('Chase Reconcile and PMT (22)', NULL, 20, 1, 1, 4),
  ('Send Capital One CC Statement to Sydney, save to file', NULL, 20, 0, 1, 4),
  ('Send Out Timesheet Approval Email - mid-month (Boomerang; review for new/terminated employees)', NULL, 20, 0, 1, 4),
  ('Check outstanding checks in Ramp', NULL, 20, 0, 1, 4),
  ('Draft WFB Equipment Loan Debt Entry (5)', NULL, 20, 1, 1, 4),
  -- Day 21
  ('Bank Analysis Fee (from Zions bank statement, arrives around the 20th) (30)', NULL, 21, 0, 1, 4),
  ('Draft OVVO Pmt - Machinery Finance (17) [C]', NULL, 21, 0, 1, 4),
  ('Payroll Entry - 2nd run (1) (make replacement transfer into the payroll reserve after) [C]', NULL, 21, 1, 1, 4),
  -- Day 22
  ('Pay Stiles (25)', NULL, 22, 0, 1, 4),
  -- Day 25
  ('Pay Nice Healthcare', NULL, 25, 0, 3, 1),
  ('Check AR Collections (25th)', NULL, 25, 0, 3, 1),
  ('Double check CCs for necessary payments', NULL, 25, 0, 1, 4),
  -- Day 26
  ('Aflac (on autopay) enter bill and payment in QB, update tracker (18)', NULL, 26, 0, 1, 4),
  ('Colonial Life (on autopay) enter bill and payment in QB, update tracker (19)', NULL, 26, 0, 1, 4),
  ('Update Deductions (after last payroll entry of the month) [C]', NULL, 26, 1, 1, 4),
  -- Day 28
  ('Send out inventory count sheets and emails', NULL, 28, 0, 1, 4),
  -- Day 31 (last day of month)
  ('Record Asset Mgmt Fee (last day of the month) - paid out on next check run', NULL, 31, 1, 1, 4),
  ('Export Allmoxy AR Summary and Save to File (as close to month end as possible)', NULL, 31, 0, 1, 4),
  ('Export order detail from Allmoxy for FG reference (as close to month end as possible)', NULL, 31, 0, 1, 4),
  ('Check Run (date as the first day of next month) (12)', NULL, 31, 0, 1, 4),
  ('Get Store Data as of month end', NULL, 31, 0, 1, 4);
