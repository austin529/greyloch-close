import { Hono } from "hono";
import type { AppContext } from "../types";

export const me = new Hono<AppContext>();

// Current user + global role. The client uses this to decide what to *show*;
// every mutation is still re-checked server-side.
me.get("/me", (c) => {
  const u = c.get("user");
  return c.json({
    id: u.id,
    email: u.email,
    name: u.name,
    system_role: u.system_role,
    // Lets the UI show a local-dev "act as" switcher. Always false in prod.
    dev_mode: c.env.AUTH_DEV_BYPASS === "true",
  });
});
