import { Hono } from "hono";
import { getPeriod, listTemplates, logActivity } from "../db";
import { notify } from "../notify";
import type { AppContext, Period } from "../types";
import { badRequest, conflict, notFound, parseId, readBody, requireAdmin } from "../util";

export const periods = new Hono<AppContext>();

/** 'YYYY-MM' + a day-of-month -> 'YYYY-MM-DD', clamped to the month length. */
function dueDateForDay(period: string, day: number | null): string | null {
  if (!day || day < 1) return null;
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${period}-${String(d).padStart(2, "0")}`;
}

// List periods, newest first, with a small progress summary for each.
periods.get("/periods", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.period_id = p.id) AS task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.period_id = p.id
                AND t.status IN ('completed','reviewed')) AS done_count
       FROM close_periods p
      ORDER BY p.period DESC`,
  ).all();
  return c.json(results ?? []);
});

periods.get("/periods/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const period = await getPeriod(c.env.DB, id);
  if (!period) notFound("Period not found.");
  return c.json(period);
});

// Open a new period and spawn task instances from the active templates.
// Template fields are COPIED into each task so later template edits never
// rewrite history (guardrail: spawn copies, don't reference).
periods.post("/periods", async (c) => {
  const user = c.get("user");
  requireAdmin(user);

  const body = await readBody<{ period?: string; target_close_date?: string }>(c);
  const period = (body.period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) badRequest("period must be 'YYYY-MM'.");
  const targetClose = body.target_close_date?.trim() || null;

  const existing = await c.env.DB.prepare("SELECT id FROM close_periods WHERE period = ?")
    .bind(period)
    .first();
  if (existing) conflict(`Period ${period} already exists.`);

  const inserted = await c.env.DB.prepare(
    `INSERT INTO close_periods (period, status, target_close_date, opened_by)
     VALUES (?, 'open', ?, ?) RETURNING *`,
  )
    .bind(period, targetClose, user.id)
    .first<Period>();
  if (!inserted) throw new Error("Failed to create period.");

  const templates = await listTemplates(c.env.DB, true);
  const statements = templates.map((t) =>
    c.env.DB.prepare(
      `INSERT INTO tasks
         (period_id, template_id, name, category, preparer_id, reviewer_id,
          requires_review, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started')`,
    ).bind(
      inserted.id,
      t.id,
      t.name,
      t.category,
      t.default_preparer_id,
      t.default_reviewer_id,
      t.requires_review,
      // due date = the template's day-of-month (sequence) within this period,
      // clamped to the month length; falls back to the period target.
      dueDateForDay(period, t.sequence) ?? targetClose,
    ),
  );
  if (statements.length) await c.env.DB.batch(statements);

  await logActivity(c.env.DB, {
    period_id: inserted.id,
    user_id: user.id,
    action: "created",
    detail: `Opened period ${period} with ${templates.length} task(s).`,
  });

  c.executionCtx.waitUntil(
    notify(c.env, {
      title: `Close period ${period} opened`,
      text: `${user.name} opened the ${period} close with ${templates.length} tasks.`,
      level: "default",
    }),
  );

  return c.json({ ...inserted, task_count: templates.length }, 201);
});

periods.post("/periods/:id/close", async (c) => {
  const user = c.get("user");
  requireAdmin(user);
  const id = parseId(c.req.param("id"));
  const period = await getPeriod(c.env.DB, id);
  if (!period) notFound("Period not found.");
  if (period.status === "closed") conflict("Period is already closed.");

  const updated = await c.env.DB.prepare(
    `UPDATE close_periods
        SET status = 'closed', closed_by = ?, closed_at = datetime('now')
      WHERE id = ? RETURNING *`,
  )
    .bind(user.id, id)
    .first<Period>();

  await logActivity(c.env.DB, {
    period_id: id,
    user_id: user.id,
    action: "status_change",
    detail: `Closed period ${period.period}.`,
  });
  c.executionCtx.waitUntil(
    notify(c.env, {
      title: `Close period ${period.period} closed`,
      text: `${user.name} closed the ${period.period} books. Tasks are now read-only.`,
      level: "good",
    }),
  );
  return c.json(updated);
});

periods.post("/periods/:id/reopen", async (c) => {
  const user = c.get("user");
  requireAdmin(user);
  const id = parseId(c.req.param("id"));
  const period = await getPeriod(c.env.DB, id);
  if (!period) notFound("Period not found.");
  if (period.status === "open") conflict("Period is already open.");

  const updated = await c.env.DB.prepare(
    `UPDATE close_periods
        SET status = 'open', closed_by = NULL, closed_at = NULL
      WHERE id = ? RETURNING *`,
  )
    .bind(id)
    .first<Period>();

  await logActivity(c.env.DB, {
    period_id: id,
    user_id: user.id,
    action: "reopened",
    detail: `Reopened period ${period.period}.`,
  });
  return c.json(updated);
});
