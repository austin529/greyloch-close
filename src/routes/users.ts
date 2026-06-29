import { Hono } from "hono";
import { listUsers } from "../db";
import type { AppContext, SystemRole, User } from "../types";
import { badRequest, conflict, forbidden, notFound, parseId, readBody, requireAdmin } from "../util";

export const users = new Hono<AppContext>();

const ROLES: SystemRole[] = ["admin", "staff", "viewer"];

// Everyone may read the user list (needed to render assignee names / pickers).
users.get("/users", async (c) => {
  return c.json(await listUsers(c.env.DB));
});

users.post("/users", async (c) => {
  requireAdmin(c.get("user"));
  const b = await readBody<User>(c);
  const email = (b.email ?? "").toString().trim().toLowerCase();
  const name = (b.name ?? "").toString().trim();
  const role = (b.system_role ?? "staff") as SystemRole;
  if (!email) badRequest("email is required.");
  if (!name) badRequest("name is required.");
  if (!ROLES.includes(role)) badRequest("system_role must be admin, staff, or viewer.");

  const dupe = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (dupe) conflict(`A user with email ${email} already exists.`);

  const row = await c.env.DB.prepare(
    `INSERT INTO users (email, name, system_role, active) VALUES (?, ?, ?, 1) RETURNING *`,
  )
    .bind(email, name, role)
    .first<User>();
  return c.json(row, 201);
});

users.patch("/users/:id", async (c) => {
  const actor = c.get("user");
  requireAdmin(actor);
  const id = parseId(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
  if (!existing) notFound("User not found.");

  const b = await readBody<User>(c);
  const next = {
    name: "name" in b ? String(b.name).trim() : existing.name,
    system_role: "system_role" in b ? (b.system_role as SystemRole) : existing.system_role,
    active: "active" in b ? (b.active ? 1 : 0) : existing.active,
    email: "email" in b ? String(b.email).trim().toLowerCase() : existing.email,
  };
  if (!next.name) badRequest("name cannot be empty.");
  if (!next.email) badRequest("email cannot be empty.");
  if (!ROLES.includes(next.system_role)) badRequest("Invalid system_role.");

  // Guardrail: don't let an admin lock everyone out by demoting/deactivating
  // the last active admin (including themselves).
  const losingAdmin =
    existing.system_role === "admin" && (next.system_role !== "admin" || next.active === 0);
  if (losingAdmin) {
    const { count } = (await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE system_role = 'admin' AND active = 1",
    ).first<{ count: number }>()) ?? { count: 0 };
    if (count <= 1) forbidden("Cannot remove the last active admin.");
  }

  if (next.email !== existing.email) {
    const dupe = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?")
      .bind(next.email, id)
      .first();
    if (dupe) conflict(`Another user already uses ${next.email}.`);
  }

  const row = await c.env.DB.prepare(
    `UPDATE users SET name=?, system_role=?, active=?, email=? WHERE id=? RETURNING *`,
  )
    .bind(next.name, next.system_role, next.active, next.email, id)
    .first<User>();
  return c.json(row);
});
