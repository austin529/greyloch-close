// Tiny fetch wrapper. In local dev (AUTH_DEV_BYPASS) we send X-Dev-Email so you
// can "act as" any seeded user; in production that header is ignored and
// Cloudflare Access supplies the real identity.

const DEV_EMAIL_KEY = "greyloch.devEmail";

export function getDevEmail(): string | null {
  return localStorage.getItem(DEV_EMAIL_KEY);
}
export function setDevEmail(email: string | null) {
  if (email) localStorage.setItem(DEV_EMAIL_KEY, email);
  else localStorage.removeItem(DEV_EMAIL_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const dev = getDevEmail();
  if (dev) headers["X-Dev-Email"] = dev;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, body?: unknown) => request<T>("POST", p, body ?? {}),
  patch: <T>(p: string, body: unknown) => request<T>("PATCH", p, body),
  del: <T>(p: string) => request<T>("DELETE", p),
};
