import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Activity, Me, Period, Task, User } from "./types";
import {
  BlockedBadge,
  Button,
  Field,
  fmtDate,
  fmtDateTime,
  inputCls,
  perms,
  StatusBadge,
} from "./ui";

export function TaskDetail({
  task,
  me,
  users,
  period,
  onClose,
  onChanged,
}: {
  task: Task;
  me: Me;
  users: User[];
  period: Period;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const admin = perms.isAdmin(me);
  const closed = period.status === "closed";
  const canEditNotes =
    !closed &&
    (admin || task.preparer_id === me.id || task.reviewer_id === me.id);
  const canFlag = canEditNotes; // same actors may flag blocked

  // Admin assignment form state.
  const [preparerId, setPreparerId] = useState<string>(task.preparer_id?.toString() ?? "");
  const [reviewerId, setReviewerId] = useState<string>(task.reviewer_id?.toString() ?? "");
  const [dueDate, setDueDate] = useState<string>(task.due_date ?? "");

  useEffect(() => {
    api.get<Activity[]>(`/tasks/${task.id}/activity`).then(setActivity).catch(() => {});
  }, [task.id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      const a = await api.get<Activity[]>(`/tasks/${task.id}/activity`);
      setActivity(a);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const activeUsers = users.filter((u) => u.active);
  const sodConflict =
    task.requires_review === 1 &&
    preparerId !== "" &&
    preparerId === reviewerId;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <StatusBadge status={task.status} />
              {task.blocked ? <BlockedBadge /> : null}
              {task.category && (
                <span className="text-xs font-medium text-slate-400">{task.category}</span>
              )}
              {task.requires_review === 0 && (
                <span className="text-xs text-slate-400">· no review required</span>
              )}
            </div>
            <h2 className="text-lg font-semibold leading-tight text-slate-900">{task.name}</h2>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </div>
          )}
          {closed && (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              This period is closed — tasks are read-only until an admin reopens it.
            </div>
          )}

          {/* actions */}
          <section className="flex flex-wrap gap-2">
            {perms.canPrepare(me, task) && (
              <Button variant="primary" disabled={busy} onClick={() => run(() => api.post(`/tasks/${task.id}/prepare`))}>
                Mark prepared
              </Button>
            )}
            {perms.canReview(me, task) && (
              <Button variant="primary" disabled={busy} onClick={() => run(() => api.post(`/tasks/${task.id}/review`))}>
                Sign off (review)
              </Button>
            )}
            {/* Admin SoD override: reviewer step blocked because admin prepared it. */}
            {admin &&
              task.requires_review === 1 &&
              task.status === "prepared" &&
              task.prepared_by === me.id && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(() => api.post(`/tasks/${task.id}/review`, { override_sod: true }))}
                >
                  Review (override SoD)
                </Button>
              )}
            {perms.canReopen(me, task) && (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => api.post(`/tasks/${task.id}/reopen`))}>
                Reopen
              </Button>
            )}
            {canFlag &&
              (task.blocked ? (
                <Button variant="secondary" disabled={busy} onClick={() => run(() => api.post(`/tasks/${task.id}/block`, { blocked: false }))}>
                  Unblock
                </Button>
              ) : (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Why is this blocked? (optional)") ?? undefined;
                    run(() => api.post(`/tasks/${task.id}/block`, { blocked: true, reason }));
                  }}
                >
                  Mark blocked
                </Button>
              ))}
          </section>

          {task.blocked ? (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <span className="font-medium">Blocked.</span> {task.blocked_reason || "No reason given."}
            </div>
          ) : null}

          {/* sign-off facts */}
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact label="Preparer" value={task.preparer_name} />
            <Fact label="Reviewer" value={task.reviewer_name} />
            <Fact label="Due" value={fmtDate(task.due_date)} />
            <Fact
              label="Prepared"
              value={task.prepared_by_name ? `${task.prepared_by_name} · ${fmtDateTime(task.prepared_at)}` : "—"}
            />
            <Fact
              label="Reviewed"
              value={task.reviewed_by_name ? `${task.reviewed_by_name} · ${fmtDateTime(task.reviewed_at)}` : "—"}
            />
          </section>

          {/* admin: assignment + scheduling */}
          {admin && !closed && (
            <section className="space-y-3 rounded-lg bg-slate-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignment (admin)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preparer">
                  <select className={inputCls} value={preparerId} onChange={(e) => setPreparerId(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Reviewer">
                  <select className={inputCls} value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Due date">
                <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              {sodConflict && (
                <p className="text-xs text-amber-700">
                  Preparer and reviewer are the same person — this needs an SoD override to save.
                </p>
              )}
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api.patch(`/tasks/${task.id}`, {
                      preparer_id: preparerId ? Number(preparerId) : null,
                      reviewer_id: reviewerId ? Number(reviewerId) : null,
                      due_date: dueDate || null,
                      ...(sodConflict ? { override_sod: true } : {}),
                    }),
                  )
                }
              >
                Save assignment
              </Button>
            </section>
          )}

          {/* notes */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</h3>
            {canEditNotes ? (
              <>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Working notes for this task…"
                />
                <Button
                  variant="secondary"
                  disabled={busy || notes === (task.notes ?? "")}
                  onClick={() => run(() => api.patch(`/tasks/${task.id}`, { notes }))}
                >
                  Save notes
                </Button>
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-600">{task.notes || "—"}</p>
            )}
          </section>

          {/* activity / comments */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</h3>
            <ol className="space-y-2 border-l border-slate-200 pl-4">
              {activity.length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
              {activity.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-300" />
                  <div className="text-slate-700">
                    <span className="font-medium">{a.user_name ?? "System"}</span>{" "}
                    <ActionText action={a.action} detail={a.detail} />
                  </div>
                  <div className="text-xs text-slate-400">{fmtDateTime(a.created_at)}</div>
                </li>
              ))}
            </ol>

            {perms.canWrite(me) && (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && comment.trim()) {
                      run(() => api.post(`/tasks/${task.id}/comments`, { text: comment.trim() }));
                      setComment("");
                    }
                  }}
                />
                <Button
                  disabled={busy || !comment.trim()}
                  onClick={() => {
                    run(() => api.post(`/tasks/${task.id}/comments`, { text: comment.trim() }));
                    setComment("");
                  }}
                >
                  Send
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="text-slate-700">{value || "—"}</div>
    </div>
  );
}

function ActionText({ action, detail }: { action: string; detail: string | null }) {
  if (action === "comment") return <span>commented: “{detail}”</span>;
  const verbs: Record<string, string> = {
    status_change: "changed status",
    assigned: "updated assignment",
    edited: "edited the task",
    reopened: "reopened",
    created: "created",
  };
  return (
    <span>
      {verbs[action] ?? action}
      {detail ? <span className="text-slate-500"> — {detail}</span> : null}
    </span>
  );
}
