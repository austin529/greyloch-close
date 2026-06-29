import { Hono } from "hono";
import { listTemplates, logActivity } from "../db";
import type { AppContext, Template } from "../types";
import { badRequest, notFound, parseId, readBody, requireAdmin, toBit } from "../util";

export const templates = new Hono<AppContext>();

// Anyone may read templates (the checklist is not secret); writes are admin-only.
templates.get("/templates", async (c) => {
  const all = c.req.query("all") === "1";
  return c.json(await listTemplates(c.env.DB, !all));
});

templates.post("/templates", async (c) => {
  requireAdmin(c.get("user"));
  const b = await readBody<Template>(c);
  const name = (b.name ?? "").toString().trim();
  if (!name) badRequest("name is required.");

  const row = await c.env.DB.prepare(
    `INSERT INTO task_templates
       (name, category, description, default_preparer_id, default_reviewer_id,
        sequence, requires_review, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      name,
      b.category ?? null,
      b.description ?? null,
      b.default_preparer_id ?? null,
      b.default_reviewer_id ?? null,
      Number.isFinite(b.sequence) ? b.sequence : 0,
      b.requires_review === undefined ? 1 : toBit(b.requires_review),
      b.active === undefined ? 1 : toBit(b.active),
    )
    .first<Template>();
  return c.json(row, 201);
});

templates.patch("/templates/:id", async (c) => {
  requireAdmin(c.get("user"));
  const id = parseId(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM task_templates WHERE id = ?")
    .bind(id)
    .first<Template>();
  if (!existing) notFound("Template not found.");

  const b = await readBody<Template>(c);
  const merged: Template = {
    ...existing,
    ...("name" in b ? { name: String(b.name).trim() } : {}),
    ...("category" in b ? { category: b.category ?? null } : {}),
    ...("description" in b ? { description: b.description ?? null } : {}),
    ...("default_preparer_id" in b ? { default_preparer_id: b.default_preparer_id ?? null } : {}),
    ...("default_reviewer_id" in b ? { default_reviewer_id: b.default_reviewer_id ?? null } : {}),
    ...("sequence" in b ? { sequence: Number(b.sequence) || 0 } : {}),
    ...("requires_review" in b ? { requires_review: toBit(b.requires_review) } : {}),
    ...("active" in b ? { active: toBit(b.active) } : {}),
  };
  if (!merged.name) badRequest("name cannot be empty.");

  const row = await c.env.DB.prepare(
    `UPDATE task_templates SET name=?, category=?, description=?,
            default_preparer_id=?, default_reviewer_id=?, sequence=?,
            requires_review=?, active=? WHERE id=? RETURNING *`,
  )
    .bind(
      merged.name,
      merged.category,
      merged.description,
      merged.default_preparer_id,
      merged.default_reviewer_id,
      merged.sequence,
      merged.requires_review,
      merged.active,
      id,
    )
    .first<Template>();
  return c.json(row);
});

// Soft delete: deactivate so historical task rows keep their template_id intact.
// Pass ?hard=1 to remove a template that was never used in any period.
templates.delete("/templates/:id", async (c) => {
  const user = c.get("user");
  requireAdmin(user);
  const id = parseId(c.req.param("id"));
  const hard = c.req.query("hard") === "1";

  if (hard) {
    const used = await c.env.DB.prepare("SELECT 1 FROM tasks WHERE template_id = ? LIMIT 1")
      .bind(id)
      .first();
    if (used) {
      // Don't break history; fall back to deactivation.
      await c.env.DB.prepare("UPDATE task_templates SET active = 0 WHERE id = ?").bind(id).run();
      return c.json({ ok: true, softDeleted: true, reason: "Template is used by existing tasks." });
    }
    await c.env.DB.prepare("DELETE FROM task_templates WHERE id = ?").bind(id).run();
    return c.json({ ok: true, deleted: true });
  }

  await c.env.DB.prepare("UPDATE task_templates SET active = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true, softDeleted: true });
});
