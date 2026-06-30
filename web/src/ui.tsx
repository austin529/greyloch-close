import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Me, Task, TaskStatus } from "./types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The Greyloch logo mark (exact vector geometry from the brand guide).
    Inherits color via currentColor — use text-brand, text-white, etc. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 45" className={className} fill="currentColor" role="img" aria-label="Greyloch">
      <rect x="0" y="0" width="20.7" height="45" />
      <rect x="22.1" y="0.1" width="45.9" height="10.2" />
      <rect x="69.3" y="0" width="20.6" height="10.4" />
      <rect x="34.6" y="17.3" width="33.4" height="10.4" />
      <rect x="69.3" y="17.3" width="20.6" height="27.7" />
      <rect x="22" y="34.6" width="46" height="10.4" />
    </svg>
  );
}

type StatusMeta = { label: string; cls: string; color: string };
export const STATUS_META: Record<string, StatusMeta> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600 ring-slate-200", color: "#cbd5e1" },
  in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-700 ring-blue-200", color: "#3b82f6" },
  prepared: { label: "Awaiting review", cls: "bg-amber-50 text-amber-700 ring-amber-200", color: "#f59e0b" },
  completed: { label: "Completed", cls: "bg-brand-50 text-brand ring-brand/30", color: "#009639" },
  // Legacy: pre-migration rows may still be 'reviewed'; treat as completed.
  reviewed: { label: "Completed", cls: "bg-brand-50 text-brand ring-brand/30", color: "#009639" },
  reopened: { label: "Reopened", cls: "bg-rose-50 text-rose-700 ring-rose-200", color: "#f43f5e" },
};

/** Prominent status pill: colored dot + label, larger than a plain tag. */
export function StatusBadge({ status, size = "md" }: { status: TaskStatus; size?: "sm" | "md" }) {
  const m = STATUS_META[status] ?? STATUS_META.not_started;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        m.cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
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

/** A task is "done" when it reaches the terminal completed state.
    ('reviewed' is the legacy pre-migration equivalent.) */
export function isTaskDone(t: Task): boolean {
  return t.status === "completed" || t.status === "reviewed";
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
    primary: "bg-brand text-white hover:bg-brand-600",
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
          className="h-full rounded-full bg-brand transition-all"
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
    t.status !== "completed" &&
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
    (t.status === "prepared" || t.status === "completed" || t.status === "reviewed") &&
    (me.system_role === "admin" ||
      t.reviewer_id === me.id ||
      (t.requires_review === 0 && t.preparer_id === me.id)),
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
