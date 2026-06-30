import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** e.g. https://greyloch.cloudflareaccess.com (no trailing slash) */
  TEAM_DOMAIN: string;
  /** Access application AUD tag */
  POLICY_AUD: string;
  /** Local-dev only. When "true", skips Access JWT validation. Never set in prod. */
  AUTH_DEV_BYPASS?: string;
  /** Local-dev only. Default identity when AUTH_DEV_BYPASS is on. */
  DEV_EMAIL?: string;
  /** Microsoft Teams incoming webhook (Power Automate). Secret. Optional. */
  TEAMS_WEBHOOK_URL?: string;
  /** Public app URL, used for links in notifications. */
  APP_URL?: string;
  /** CData Connect Cloud query endpoint + credentials for QuickBooks reads.
      Until set, reconciliation parses the statement but skips QBO matching. */
  CDATA_API_URL?: string;
  CDATA_USERNAME?: string;
  CDATA_TOKEN?: string;
}

export type SystemRole = "admin" | "staff" | "viewer";

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "prepared"
  | "completed"
  | "reviewed" // legacy: migrated to 'completed'; kept for tolerance
  | "reopened";

export interface User {
  id: number;
  email: string;
  name: string;
  system_role: SystemRole;
  active: number;
  created_at: string;
}

export interface Period {
  id: number;
  period: string;
  status: "open" | "closed";
  target_close_date: string | null;
  opened_by: number | null;
  opened_at: string;
  closed_by: number | null;
  closed_at: string | null;
}

export interface Task {
  id: number;
  period_id: number;
  template_id: number | null;
  name: string;
  category: string | null;
  preparer_id: number | null;
  reviewer_id: number | null;
  requires_review: number;
  due_date: string | null;
  status: TaskStatus;
  prepared_by: number | null;
  prepared_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  notes: string | null;
  blocked: number;
  blocked_reason: string | null;
}

export interface Template {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  default_preparer_id: number | null;
  default_reviewer_id: number | null;
  sequence: number;
  requires_review: number;
  active: number;
}

export interface ActivityEntry {
  id: number;
  task_id: number | null;
  period_id: number | null;
  user_id: number | null;
  action: string;
  detail: string | null;
  created_at: string;
}

// Hono context typing: env bindings + the authenticated user we attach.
export type AppContext = {
  Bindings: Env;
  Variables: { user: User };
};

export type Ctx = Context<AppContext>;
