import { Hono } from "hono";
import { getPeriod, getTask, logActivity, taskActivity } from "../db";
import { notify } from "../notify";
import type { AppContext, Task, TaskStatus, User } from "../types";
import {
  badRequest,
  conflict,
  forbidden,
  isAdmin,
  isPreparer,
  isReviewer,
  notFound,
  parseId,
  readBody,
  requireOpenPeriod,
  requireWriter,
} from "../util";

export const tasks = new Hono<AppContext>();

const TASK_SELECT = `
  SELECT t.*,
         pp.name  AS preparer_name,
         rr.name  AS reviewer_name,
         pb.name  AS prepared_by_name,
         rb.name  AS reviewed_by_name
    FROM tasks t
    LEFT JOIN users pp ON pp.id = t.preparer_id
    LEFT JOIN users rr ON rr.id = t.reviewer_id
    LEFT JOIN users pb ON pb.id = t.prepared_by
    LEFT JOIN users rb ON rb.id = t.reviewed_by`;

async function taskWithNames(db: D1Database, id: number): Promise<TaskRow | null> {
  return db.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first<TaskRow>();
}

// All tasks for a period, ordered by due date (the day-of-the-month model), so
// it works the same for template-spawned and Monday-migrated tasks.
tasks.get("/periods/:id/tasks", async (c) => {
  const periodId = parseId(c.req.param("id"));
  const period = await getPeriod(c.env.DB, periodId);
  if (!period) notFound("Period not found.");
  const { results } = await c.env.DB.prepare(
    `${TASK_SELECT}
      WHERE t.period_id = ?
      ORDER BY (t.due_date IS NULL), t.due_date, t.category COLLATE NOCASE, t.id`,
  )
    .bind(periodId)
    .all();
  return c.json({ period, tasks: results ?? [] });
});

tasks.get("/tasks/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const task = await taskWithNames(c.env.DB, id);
  if (!task) notFound("Task not found.");
  return c.json(task);
});

// Load a task and its period, or 404. Used by every mutation below.
async function loadTaskAndPeriod(db: D1Database, id: number) {
  const task = await getTask(db, id);
  if (!task) notFound("Task not found.");
  const period = await getPeriod(db, task.period_id);
  return { task, period };
}

// Edit notes / due date (assigned or admin) and assignment / name / category
// (admin only). Closed periods are read-only.
tasks.patch("/tasks/:id", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const { task, period } = await loadTaskAndPeriod(c.env.DB, id);
  requireOpenPeriod(period);

  const body = await readBody<Record<string, unknown>>(c);
  const structuralKeys = ["preparer_id", "reviewer_id", "name", "category", "due_date", "requires_review"];
  const wantsStructural = structuralKeys.some((k) => k in body);
  const wantsNotes = "notes" in body;

  // Only admins may reassign / rename / recategorise / move due dates.
  if (wantsStructural && !isAdmin(user)) {
    forbidden("Only an admin can change assignment, name, category, or due date.");
  }
  // Notes: assigned preparer/reviewer or admin.
  if (wantsNotes && !isAdmin(user) && !isPreparer(user, task) && !isReviewer(user, task)) {
    forbidden("Only the assigned preparer/reviewer or an admin can edit notes.");
  }
  if (!wantsStructural && !wantsNotes) badRequest("Nothing to update.");

  const next = {
    name: "name" in body ? String(body.name).trim() : task.name,
    category: "category" in body ? nullableStr(body.category) : task.category,
    preparer_id: "preparer_id" in body ? nullableId(body.preparer_id) : task.preparer_id,
    reviewer_id: "reviewer_id" in body ? nullableId(body.reviewer_id) : task.reviewer_id,
    requires_review: "requires_review" in body ? (body.requires_review ? 1 : 0) : task.requires_review,
    due_date: "due_date" in body ? nullableStr(body.due_date) : task.due_date,
    notes: "notes" in body ? nullableStr(body.notes) : task.notes,
  };
  if (!next.name) badRequest("name cannot be empty.");

  // Segregation of duties at assignment time. Admin may override explicitly.
  const overrideSod = body.override_sod === true && isAdmin(user);
  if (
    next.requires_review === 1 &&
    next.preparer_id != null &&
    next.reviewer_id != null &&
    next.preparer_id === next.reviewer_id &&
    !overrideSod
  ) {
    conflict(
      "Segregation of duties: preparer and reviewer must differ on a task that requires review. " +
        "An admin can override with override_sod:true.",
    );
  }

  // Turning off the review requirement on an awaiting-review task completes it.
  const newStatus: TaskStatus =
    next.requires_review === 0 && task.status === "prepared" ? "completed" : task.status;

  const updated = await c.env.DB.prepare(
    `UPDATE tasks SET name = ?, category = ?, preparer_id = ?, reviewer_id = ?,
            requires_review = ?, due_date = ?, notes = ?, status = ? WHERE id = ? RETURNING *`,
  )
    .bind(
      next.name,
      next.category,
      next.preparer_id,
      next.reviewer_id,
      next.requires_review,
      next.due_date,
      next.notes,
      newStatus,
      id,
    )
    .first<Task>();

  // Audit the meaningful changes.
  await logChanges(c.env.DB, user, task, next, overrideSod);
  if (task.requires_review !== next.requires_review) {
    await logActivity(c.env.DB, {
      task_id: id,
      period_id: task.period_id,
      user_id: user.id,
      action: "edited",
      detail: next.requires_review ? "Now requires a reviewer sign-off." : "No reviewer required.",
    });
  }

  const full = await taskWithNames(c.env.DB, id);
  return c.json(full ?? updated);
});

// Preparer marks their work done.
//   requires_review = 1 -> 'prepared' (awaiting a reviewer sign-off)
//   requires_review = 0 -> 'completed' (terminal; no review needed)
tasks.post("/tasks/:id/prepare", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const { task, period } = await loadTaskAndPeriod(c.env.DB, id);
  requireOpenPeriod(period);

  if (!isAdmin(user) && !isPreparer(user, task)) {
    forbidden("Only the assigned preparer or an admin can complete this.");
  }
  if (task.status === "prepared" || task.status === "completed" || task.status === "reviewed") {
    conflict(`Task is already ${task.status}.`);
  }

  const reviewRequired = task.requires_review === 1;
  const newStatus = reviewRequired ? "prepared" : "completed";
  await transition(c.env.DB, task, newStatus, {
    prepared_by: user.id,
    prepared_at: true,
  });
  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: "status_change",
    detail: `${task.status} -> ${newStatus}`,
  });
  const full = (await taskWithNames(c.env.DB, id)) as TaskRow;
  // Ready for review -> ping the reviewer.
  if (reviewRequired && full?.reviewer_name) {
    c.executionCtx.waitUntil(
      notify(c.env, {
        title: "Ready for review",
        text: `${user.name} prepared "${full.name}".`,
        forWhom: full.reviewer_name,
        level: "warning",
        facts: factsFor(full),
      }),
    );
  }
  return c.json(full);
});

// prepared -> reviewed (with segregation of duties)
tasks.post("/tasks/:id/review", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const { task, period } = await loadTaskAndPeriod(c.env.DB, id);
  requireOpenPeriod(period);

  if (task.requires_review === 0) badRequest("This task does not require review.");
  if (task.status !== "prepared") conflict("Task must be prepared before it can be reviewed.");
  if (!isAdmin(user) && !isReviewer(user, task)) {
    forbidden("Only the assigned reviewer or an admin can sign off.");
  }

  const body = await readBody<{ override_sod?: boolean }>(c);
  const overrideSod = body.override_sod === true && isAdmin(user);
  // Segregation of duties: the preparer cannot review their own work.
  if (!overrideSod && task.prepared_by === user.id) {
    forbidden("Segregation of duties: you prepared this task and cannot review it.");
  }
  if (!overrideSod && task.reviewer_id != null && task.reviewer_id === task.preparer_id) {
    conflict("Segregation of duties: reviewer and preparer are the same person.");
  }

  await transition(c.env.DB, task, "completed", {
    reviewed_by: user.id,
    reviewed_at: true,
  });
  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: "status_change",
    detail: overrideSod ? "prepared -> completed (SoD overridden by admin)" : "prepared -> completed",
  });
  const full = (await taskWithNames(c.env.DB, id)) as TaskRow;
  if (full?.prepared_by_name) {
    c.executionCtx.waitUntil(
      notify(c.env, {
        title: "Task signed off",
        text: `${user.name} reviewed and approved "${full.name}".`,
        forWhom: full.prepared_by_name,
        level: "good",
        facts: factsFor(full),
      }),
    );
  }
  return c.json(full);
});

// prepared / completed -> reopened (pulls back sign-offs; redo required)
tasks.post("/tasks/:id/reopen", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const { task, period } = await loadTaskAndPeriod(c.env.DB, id);
  requireOpenPeriod(period);

  // Admin, the reviewer, or (for no-review tasks) the preparer may reopen.
  const mayReopen =
    isAdmin(user) ||
    isReviewer(user, task) ||
    (task.requires_review === 0 && isPreparer(user, task));
  if (!mayReopen) {
    forbidden("Only the reviewer, preparer, or an admin can reopen a task.");
  }
  if (task.status !== "prepared" && task.status !== "completed" && task.status !== "reviewed") {
    conflict("Only prepared or completed tasks can be reopened.");
  }

  const body = await readBody<{ reason?: string }>(c);
  await c.env.DB.prepare(
    `UPDATE tasks SET status = 'reopened',
            prepared_by = NULL, prepared_at = NULL,
            reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ?`,
  )
    .bind(id)
    .run();
  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: "reopened",
    detail: body.reason ? `${task.status} -> reopened: ${body.reason}` : `${task.status} -> reopened`,
  });
  const full = (await taskWithNames(c.env.DB, id)) as TaskRow;
  if (full?.preparer_name) {
    c.executionCtx.waitUntil(
      notify(c.env, {
        title: "Task reopened",
        text: `${user.name} reopened "${full.name}".${body.reason ? ` Reason: ${body.reason}` : ""}`,
        forWhom: full.preparer_name,
        level: "attention",
        facts: factsFor(full),
      }),
    );
  }
  return c.json(full);
});

// Flag/unflag a task as blocked ("Stuck"). Orthogonal to prepare/review.
tasks.post("/tasks/:id/block", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const { task, period } = await loadTaskAndPeriod(c.env.DB, id);
  requireOpenPeriod(period);
  if (!isAdmin(user) && !isPreparer(user, task) && !isReviewer(user, task)) {
    forbidden("Only the assigned preparer/reviewer or an admin can flag this.");
  }

  const body = await readBody<{ blocked?: boolean; reason?: string }>(c);
  const blocked = body.blocked === false ? 0 : 1;
  const reason = blocked ? (body.reason?.trim() || null) : null;
  await c.env.DB.prepare("UPDATE tasks SET blocked = ?, blocked_reason = ? WHERE id = ?")
    .bind(blocked, reason, id)
    .run();
  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: blocked ? "blocked" : "unblocked",
    detail: blocked ? (reason ? `Blocked: ${reason}` : "Marked blocked") : "Unblocked",
  });

  const full = (await taskWithNames(c.env.DB, id)) as TaskRow;
  if (blocked) {
    c.executionCtx.waitUntil(
      notify(c.env, {
        title: "Task blocked",
        text: `${user.name} flagged "${full.name}" as blocked.${reason ? ` ${reason}` : ""}`,
        level: "attention",
        facts: factsFor(full),
      }),
    );
  }
  return c.json(full);
});

// Collaboration comment -> append-only activity_log entry.
tasks.post("/tasks/:id/comments", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const task = await getTask(c.env.DB, id);
  if (!task) notFound("Task not found.");

  const body = await readBody<{ text?: string }>(c);
  const text = (body.text ?? "").trim();
  if (!text) badRequest("Comment text is required.");

  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: "comment",
    detail: text,
  });
  return c.json({ ok: true });
});

tasks.get("/tasks/:id/activity", async (c) => {
  const id = parseId(c.req.param("id"));
  const task = await getTask(c.env.DB, id);
  if (!task) notFound("Task not found.");
  return c.json(await taskActivity(c.env.DB, id));
});

// ---- helpers ----

type TaskRow = Task & {
  preparer_name: string | null;
  reviewer_name: string | null;
  prepared_by_name: string | null;
  reviewed_by_name: string | null;
};

function factsFor(t: TaskRow): { title: string; value: string }[] {
  return [
    { title: "Due", value: t.due_date ?? "—" },
    { title: "Preparer", value: t.preparer_name ?? "—" },
    { title: "Reviewer", value: t.reviewer_name ?? "—" },
  ];
}

function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function nullableId(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) badRequest("Invalid user id in assignment.");
  return n;
}

async function transition(
  db: D1Database,
  task: Task,
  status: TaskStatus,
  set: { prepared_by?: number; prepared_at?: boolean; reviewed_by?: number; reviewed_at?: boolean },
) {
  const cols: string[] = ["status = ?"];
  const binds: unknown[] = [status];
  if (set.prepared_by !== undefined) {
    cols.push("prepared_by = ?");
    binds.push(set.prepared_by);
  }
  if (set.prepared_at) cols.push("prepared_at = datetime('now')");
  if (set.reviewed_by !== undefined) {
    cols.push("reviewed_by = ?");
    binds.push(set.reviewed_by);
  }
  if (set.reviewed_at) cols.push("reviewed_at = datetime('now')");
  binds.push(task.id);
  await db.prepare(`UPDATE tasks SET ${cols.join(", ")} WHERE id = ?`).bind(...binds).run();
}

async function logChanges(
  db: D1Database,
  user: User,
  before: Task,
  after: {
    name: string;
    category: string | null;
    preparer_id: number | null;
    reviewer_id: number | null;
    due_date: string | null;
    notes: string | null;
  },
  overrideSod: boolean,
) {
  const diffs: string[] = [];
  if (before.preparer_id !== after.preparer_id || before.reviewer_id !== after.reviewer_id) {
    await logActivity(db, {
      task_id: before.id,
      period_id: before.period_id,
      user_id: user.id,
      action: "assigned",
      detail:
        `preparer ${before.preparer_id ?? "-"} -> ${after.preparer_id ?? "-"}, ` +
        `reviewer ${before.reviewer_id ?? "-"} -> ${after.reviewer_id ?? "-"}` +
        (overrideSod ? " (SoD overridden)" : ""),
    });
  }
  if (before.name !== after.name) diffs.push(`name`);
  if (before.category !== after.category) diffs.push(`category`);
  if (before.due_date !== after.due_date) diffs.push(`due date`);
  if (before.notes !== after.notes) diffs.push(`notes`);
  if (diffs.length) {
    await logActivity(db, {
      task_id: before.id,
      period_id: before.period_id,
      user_id: user.id,
      action: "edited",
      detail: `Updated ${diffs.join(", ")}.`,
    });
  }
}
