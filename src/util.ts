import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Period, Task, User } from "./types";

/** Parse a JSON request body, tolerating an empty/invalid body as {}. */
export async function readBody<T>(c: Context): Promise<Partial<T>> {
  try {
    return (((await c.req.json()) as Partial<T>) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}

/** Thrown by route handlers; converted to a JSON error response by app.onError. */
export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, message: string) {
    super(message);
  }
}

export function badRequest(msg: string): never {
  throw new HttpError(400, msg);
}
export function forbidden(msg: string): never {
  throw new HttpError(403, msg);
}
export function notFound(msg: string): never {
  throw new HttpError(404, msg);
}
export function conflict(msg: string): never {
  throw new HttpError(409, msg);
}

// ---- role / capability helpers ----

export const isAdmin = (u: User) => u.system_role === "admin";
export const isViewer = (u: User) => u.system_role === "viewer";

/** Anyone who is not a viewer may perform write actions they are entitled to. */
export function requireWriter(u: User): void {
  if (isViewer(u)) forbidden("Viewers have read-only access.");
}

export function requireAdmin(u: User): void {
  if (!isAdmin(u)) forbidden("Admin only.");
}

export const isPreparer = (u: User, t: Task) => t.preparer_id === u.id;
export const isReviewer = (u: User, t: Task) => t.reviewer_id === u.id;

/** Closed periods are read-only; reject mutations unless an admin reopens. */
export function requireOpenPeriod(period: Period | null): void {
  if (!period) notFound("Period not found.");
  if (period.status === "closed") {
    conflict("This period is closed. An admin must reopen it before changes can be made.");
  }
}

export function parseId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) badRequest("Invalid id.");
  return n;
}

/** Truthy/1/0 normaliser for the integer booleans D1 stores. */
export function toBit(v: unknown): 0 | 1 {
  return v ? 1 : 0;
}
