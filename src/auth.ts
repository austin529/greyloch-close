import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { MiddlewareHandler } from "hono";
import { userByEmail } from "./db";
import type { AppContext, Env } from "./types";

// Cache the remote JWKS per team domain across requests (module scope persists
// for the lifetime of the isolate). jose handles fetching + key rotation.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Resolve the verified email for a request.
 * Production: validate the Cloudflare Access JWT (signature + iss + aud).
 * Local dev: when AUTH_DEV_BYPASS is "true", trust X-Dev-Email / DEV_EMAIL.
 */
async function resolveEmail(req: Request, env: Env): Promise<string> {
  if (env.AUTH_DEV_BYPASS === "true") {
    const email = req.headers.get("x-dev-email") || env.DEV_EMAIL;
    if (!email) throw new AuthError(401, "Dev bypass on but no X-Dev-Email / DEV_EMAIL");
    return email.toLowerCase();
  }

  if (!env.POLICY_AUD || !env.TEAM_DOMAIN) {
    throw new AuthError(500, "Server missing TEAM_DOMAIN / POLICY_AUD configuration");
  }

  // Access passes the JWT in this header (also in the CF_Authorization cookie).
  const token =
    req.headers.get("cf-access-jwt-assertion") ||
    cookie(req, "CF_Authorization");
  if (!token) throw new AuthError(401, "Missing Cloudflare Access token");

  let payload: JWTPayload & { email?: string };
  try {
    const result = await jwtVerify(token, getJwks(env.TEAM_DOMAIN), {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });
    payload = result.payload;
  } catch (err) {
    throw new AuthError(403, `Invalid Access token: ${(err as Error).message}`);
  }

  if (!payload.email) throw new AuthError(403, "Access token has no email claim");
  return payload.email.toLowerCase();
}

function cookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Hono middleware: authenticate the caller and attach the resolved user.
 * Authentication only — authorization is enforced per route.
 */
export const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  let email: string;
  try {
    email = await resolveEmail(c.req.raw, c.env);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status as 401);
    throw err;
  }

  const user = await userByEmail(c.env.DB, email);
  if (!user) {
    return c.json(
      { error: `Authenticated as ${email} but no matching user in this app. Contact an admin.` },
      403,
    );
  }
  if (!user.active) {
    return c.json({ error: "Your account is deactivated." }, 403);
  }

  c.set("user", user);
  await next();
};
