import type { ActivityEntry, Period, Task, Template, User } from "./types";

// Thin query helpers over the D1 binding. Kept deliberately small — this app is
// not big enough to warrant an ORM.

export async function userByEmail(db: D1Database, email: string): Promise<User | null> {
  return db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<User>();
}

export async function userById(db: D1Database, id: number): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first<User>();
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db
    .prepare("SELECT * FROM users ORDER BY active DESC, name")
    .all<User>();
  return results ?? [];
}

export async function getPeriod(db: D1Database, id: number): Promise<Period | null> {
  return db.prepare("SELECT * FROM close_periods WHERE id = ?").bind(id).first<Period>();
}

export async function getTask(db: D1Database, id: number): Promise<Task | null> {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
}

export async function listTemplates(db: D1Database, activeOnly = false): Promise<Template[]> {
  const sql = activeOnly
    ? "SELECT * FROM task_templates WHERE active = 1 ORDER BY sequence, name"
    : "SELECT * FROM task_templates ORDER BY sequence, name";
  const { results } = await db.prepare(sql).all<Template>();
  return results ?? [];
}

export interface ActivityInput {
  task_id?: number | null;
  period_id?: number | null;
  user_id: number | null;
  action: string;
  detail?: string | null;
}

/** Append-only audit write. Never updated or deleted. */
export async function logActivity(db: D1Database, e: ActivityInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activity_log (task_id, period_id, user_id, action, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(e.task_id ?? null, e.period_id ?? null, e.user_id, e.action, e.detail ?? null)
    .run();
}

export async function taskActivity(db: D1Database, taskId: number): Promise<ActivityEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.task_id = ?
        ORDER BY a.created_at, a.id`,
    )
    .bind(taskId)
    .all<ActivityEntry & { user_name: string | null; user_email: string | null }>();
  return results ?? [];
}
