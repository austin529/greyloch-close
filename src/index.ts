import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { notify } from "./notify";
import { me } from "./routes/me";
import { periods } from "./routes/periods";
import { tasks } from "./routes/tasks";
import { templates } from "./routes/templates";
import { users } from "./routes/users";
import type { Env, AppContext } from "./types";
import { HttpError } from "./util";

const app = new Hono<AppContext>();

// Everything under /api requires a valid identity. Authorization is enforced
// per route. (Static assets are served by the platform before the Worker via
// the assets binding + run_worker_first config, so the Worker only sees /api.)
const api = new Hono<AppContext>();
api.use("*", authMiddleware);
api.route("/", me);
api.route("/", periods);
api.route("/", tasks);
api.route("/", templates);
api.route("/", users);

app.route("/api", api);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Daily overdue digest, posted to Teams via the cron trigger. Looks at all open
// periods and lists tasks that are past due and not yet done.
async function overdueDigest(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT t.name, t.due_date, t.blocked, u.name AS preparer_name
       FROM tasks t
       JOIN close_periods p ON p.id = t.period_id AND p.status = 'open'
       LEFT JOIN users u ON u.id = t.preparer_id
      WHERE t.due_date IS NOT NULL
        AND t.due_date < ?
        AND t.status NOT IN ('reviewed')
        AND NOT (t.requires_review = 0 AND t.status = 'prepared')
      ORDER BY t.due_date`,
  )
    .bind(today)
    .all<{ name: string; due_date: string; blocked: number; preparer_name: string | null }>();

  const rows = results ?? [];
  if (rows.length === 0) return;

  const lines = rows
    .slice(0, 25)
    .map((r) => `• ${r.name}${r.blocked ? " (blocked)" : ""} — due ${r.due_date}, ${r.preparer_name ?? "unassigned"}`)
    .join("\n");
  await notify(env, {
    title: `${rows.length} overdue close task(s)`,
    text: lines + (rows.length > 25 ? `\n…and ${rows.length - 25} more.` : ""),
    level: "attention",
  });
}

export default {
  fetch: app.fetch,
  // Cron-triggered (see wrangler.jsonc triggers.crons).
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(overdueDigest(env));
  },
};
