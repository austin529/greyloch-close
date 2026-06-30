export type SystemRole = "admin" | "staff" | "viewer";

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "prepared"
  | "completed"
  | "reviewed" // legacy: migrated to 'completed'; kept for tolerance
  | "reopened";

export interface Me {
  id: number;
  email: string;
  name: string;
  system_role: SystemRole;
  dev_mode: boolean;
}

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
  task_count?: number;
  done_count?: number;
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
  preparer_name: string | null;
  reviewer_name: string | null;
  prepared_by_name: string | null;
  reviewed_by_name: string | null;
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

export interface Activity {
  id: number;
  task_id: number | null;
  period_id: number | null;
  user_id: number | null;
  action: string;
  detail: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}
