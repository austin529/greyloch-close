import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import { TaskDetail } from "./TaskDetail";
import type { Me, Period, Task, User } from "./types";
import {
  BlockedBadge,
  Button,
  cx,
  Field,
  fmtDate,
  inputCls,
  isOverdue,
  isTaskDone,
  perms,
  PersonChip,
  ProgressBar,
  STATUS_META,
  StatusBadge,
} from "./ui";

type Filter = "all" | "prepare" | "review";

export function Dashboard({
  me,
  users,
  periods,
  onPeriodsChanged,
}: {
  me: Me;
  users: User[];
  periods: Period[];
  onPeriodsChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [personId, setPersonId] = useState<number | "all">("all");
  const [blockedOnly, setBlockedOnly] = useState(false);

  // Default to the newest period.
  useEffect(() => {
    if (selectedId == null && periods.length) setSelectedId(periods[0].id);
  }, [periods, selectedId]);

  async function loadTasks(id: number) {
    setLoading(true);
    try {
      const data = await api.get<{ period: Period; tasks: Task[] }>(`/periods/${id}/tasks`);
      setPeriod(data.period);
      setTasks(data.tasks);
      // keep the open drawer in sync after a mutation
      setOpenTask((cur) => (cur ? data.tasks.find((t) => t.id === cur.id) ?? null : null));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId != null) loadTasks(selectedId).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (filter === "prepare") list = list.filter((t) => t.preparer_id === me.id);
    else if (filter === "review") list = list.filter((t) => t.reviewer_id === me.id);
    if (personId !== "all") {
      list = list.filter((t) => t.preparer_id === personId || t.reviewer_id === personId);
    }
    if (blockedOnly) list = list.filter((t) => t.blocked);
    return list;
  }, [tasks, filter, me.id, personId, blockedOnly]);

  const blockedCount = tasks.filter((t) => t.blocked).length;

  const hasCategories = useMemo(
    () => filtered.some((t) => t.category && t.category.trim() !== ""),
    [filtered],
  );
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const doneCount = tasks.filter(isTaskDone).length;
  const overdueCount = tasks.filter(isOverdue).length;
  const myCount = tasks.filter((t) => t.preparer_id === me.id || t.reviewer_id === me.id).length;

  return (
    <div className="space-y-5">
      {/* period bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border-0 bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-slate-300"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {periods.length === 0 && <option>No periods yet</option>}
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.period} {p.status === "closed" ? "(closed)" : ""}
            </option>
          ))}
        </select>

        {period && (
          <span
            className={cx(
              "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
              period.status === "open"
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : "bg-slate-100 text-slate-600 ring-slate-200",
            )}
          >
            {period.status}
          </span>
        )}

        <div className="flex-1" />

        {perms.isAdmin(me) && (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setShowOpenModal(true)}>
              + Open period
            </Button>
            {period && period.status === "open" && (
              <Button
                variant="secondary"
                onClick={() =>
                  confirm(`Close ${period.period}? Tasks become read-only.`) &&
                  api
                    .post(`/periods/${period.id}/close`)
                    .then(() => {
                      onPeriodsChanged();
                      loadTasks(period.id);
                    })
                    .catch((e) => setError(e instanceof ApiError ? e.message : String(e)))
                }
              >
                Close period
              </Button>
            )}
            {period && period.status === "closed" && (
              <Button
                variant="secondary"
                onClick={() =>
                  api
                    .post(`/periods/${period.id}/reopen`)
                    .then(() => {
                      onPeriodsChanged();
                      loadTasks(period.id);
                    })
                    .catch((e) => setError(e instanceof ApiError ? e.message : String(e)))
                }
              >
                Reopen period
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      {!period && !loading && (
        <EmptyState isAdmin={perms.isAdmin(me)} onOpen={() => setShowOpenModal(true)} />
      )}

      {period && (
        <>
          {/* summary */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                Progress
              </span>
              {overdueCount > 0 && (
                <span className="text-xs font-medium text-rose-600">{overdueCount} overdue</span>
              )}
            </div>
            <ProgressBar done={doneCount} total={tasks.length} />
          </div>

          {/* filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5 text-sm">
              <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
                All ({tasks.length})
              </FilterTab>
              <FilterTab active={filter === "prepare"} onClick={() => setFilter("prepare")}>
                I prepare ({tasks.filter((t) => t.preparer_id === me.id).length})
              </FilterTab>
              <FilterTab active={filter === "review"} onClick={() => setFilter("review")}>
                I review ({tasks.filter((t) => t.reviewer_id === me.id).length})
              </FilterTab>
            </div>

            {/* Admins can scope to any person's queue (Monday's per-person views). */}
            {perms.isAdmin(me) && (
              <select
                className="rounded-md border-0 bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-slate-300"
                value={personId}
                onChange={(e) => setPersonId(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">Everyone</option>
                {users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}

            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
              Blocked only
              {blockedCount > 0 && <span className="text-xs text-rose-600">({blockedCount})</span>}
            </label>
          </div>
          {filter === "all" && personId === "all" && myCount > 0 && (
            <p className="text-xs text-slate-400">{myCount} task(s) assigned to you this period.</p>
          )}

          {/* task list — grouped by category, or one day-ordered list when the
              checklist has no categories (as with the Monday-sourced list) */}
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400">No tasks match this filter.</p>
          ) : hasCategories ? (
            <div className="space-y-5">
              {groups.map(([category, items]) => (
                <div key={category}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
                    <span className="text-xs text-slate-400">
                      {items.filter(isTaskDone).length}/{items.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                    <RowHeader />
                    {items.map((t) => (
                      <TaskRow key={t.id} task={t} me={me} first={false} onClick={() => setOpenTask(t)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <RowHeader />
              {filtered.map((t) => (
                <TaskRow key={t.id} task={t} me={me} first={false} onClick={() => setOpenTask(t)} />
              ))}
            </div>
          )}
        </>
      )}

      {openTask && period && (
        <TaskDetail
          task={openTask}
          me={me}
          users={users}
          period={period}
          onClose={() => setOpenTask(null)}
          onChanged={() => loadTasks(period.id)}
        />
      )}

      {showOpenModal && (
        <OpenPeriodModal
          existing={periods.map((p) => p.period)}
          onClose={() => setShowOpenModal(false)}
          onCreated={(id) => {
            setShowOpenModal(false);
            onPeriodsChanged();
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function TaskRow({
  task,
  me,
  first,
  onClick,
}: {
  task: Task;
  me: Me;
  first: boolean;
  onClick: () => void;
}) {
  const overdue = isOverdue(task);
  // Colored left bar makes the task's state obvious at a glance; blocked wins.
  const barColor = task.blocked ? "#e11d48" : STATUS_META[task.status].color;
  return (
    <button
      onClick={onClick}
      style={{ borderLeftColor: barColor }}
      className={cx(
        "flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left hover:bg-slate-50",
        !first && "border-t border-slate-100",
      )}
    >
      <span className="w-32 shrink-0">
        <StatusBadge status={task.status} />
      </span>
      <span className="hidden w-32 shrink-0 sm:block">
        <PersonChip id={task.preparer_id} name={task.preparer_name} />
      </span>
      <span className="hidden w-32 shrink-0 sm:block">
        {task.requires_review ? (
          <PersonChip id={task.reviewer_id} name={task.reviewer_name} />
        ) : (
          <span className="text-xs text-slate-300">no review</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
        {task.name}
        {task.blocked ? <span className="ml-2 align-middle"><BlockedBadge /></span> : null}
      </span>
      <span className={cx("shrink-0 text-xs", overdue ? "font-semibold text-rose-600" : "text-slate-400")}>
        {task.due_date ? fmtDate(task.due_date) : ""}
        {overdue && " · overdue"}
      </span>
    </button>
  );
}

// Column header aligned with TaskRow (border-l-4 transparent matches the row's
// colored status bar so columns line up).
function RowHeader() {
  return (
    <div className="flex items-center gap-3 border-l-4 border-transparent border-b border-slate-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <span className="w-32 shrink-0">Status</span>
      <span className="hidden w-32 shrink-0 sm:block">Preparer</span>
      <span className="hidden w-32 shrink-0 sm:block">Reviewer</span>
      <span className="min-w-0 flex-1">Task</span>
      <span className="shrink-0">Due</span>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-md px-3 py-1 font-medium transition",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ isAdmin, onOpen }: { isAdmin: boolean; onOpen: () => void }) {
  return (
    <div className="rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
      <p className="text-slate-600">No close period yet.</p>
      {isAdmin ? (
        <div className="mt-3">
          <Button variant="primary" onClick={onOpen}>
            Open the first period
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-400">An admin needs to open a period.</p>
      )}
    </div>
  );
}

function OpenPeriodModal({
  existing,
  onClose,
  onCreated,
}: {
  existing: string[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [period, setPeriod] = useState(suggestNextPeriod(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Period>("/periods", { period });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Open a close period" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Period (YYYY-MM)">
          <input className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-06" />
        </Field>
        <p className="text-xs text-slate-400">
          This spawns a task for every active template, copying its name, category, and default assignees.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            Open period
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function groupByCategory(tasks: Task[]): [string, Task[]][] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.category || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return [...map.entries()];
}

function suggestNextPeriod(existing: string[]): string {
  const now = new Date();
  // default to the current month; bump if it already exists
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1-12
  for (let i = 0; i < 24; i++) {
    const candidate = `${y}-${String(m).padStart(2, "0")}`;
    if (!existing.includes(candidate)) return candidate;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}
