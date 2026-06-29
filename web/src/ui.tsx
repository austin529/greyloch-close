import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Me, Task, TaskStatus } from "./types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  prepared: { label: "Prepared", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  reviewed: { label: "Reviewed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  reopened: { label: "Reopened", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

export function BlockedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-300">
      Blocked
    </span>
  );
}

/** A task is "done" when reviewed, or prepared on a no-review task. */
export function isTaskDone(t: Task): boolean {
  return t.status === "reviewed" || (t.requires_review === 0 && t.status === "prepared");
}

export function isOverdue(t: Task): boolean {
  if (!t.due_date || isTaskDone(t)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return t.due_date < today;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};
export function Button({ variant = "secondary", className, ...rest }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    ghost: "text-slate-500 hover:bg-slate-100",
  };
  return <button className={cx(base, variants[variant], className)} {...rest} />;
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
        {done}/{total} ({pct}%)
      </span>
    </div>
  );
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  // Date-only values ('YYYY-MM-DD') are calendar dates — parse as LOCAL so a
  // due date doesn't shift to the previous day in negative-offset timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(s.includes(" ") ? s.replace(" ", "T") + "Z" : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const iso = s.includes(" ") ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Client-side mirrors of the server's permission rules. These only drive what
// the UI shows/enables — the Worker re-checks every mutation.
export const perms = {
  isAdmin: (me: Me) => me.system_role === "admin",
  canWrite: (me: Me) => me.system_role !== "viewer",
  canPrepare: (me: Me, t: Task) =>
    me.system_role !== "viewer" &&
    (me.system_role === "admin" || t.preparer_id === me.id) &&
    t.status !== "prepared" &&
    t.status !== "reviewed",
  canReview: (me: Me, t: Task) =>
    me.system_role !== "viewer" &&
    t.requires_review === 1 &&
    t.status === "prepared" &&
    (me.system_role === "admin" || t.reviewer_id === me.id) &&
    // SoD: preparer can't review their own work (admin may override in the UI).
    (me.system_role === "admin" || t.prepared_by !== me.id),
  canReopen: (me: Me, t: Task) =>
    me.system_role !== "viewer" &&
    (me.system_role === "admin" || t.reviewer_id === me.id) &&
    (t.status === "prepared" || t.status === "reviewed"),
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border-0 px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-500 bg-white";
