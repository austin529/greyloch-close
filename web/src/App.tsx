import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getDevEmail, setDevEmail } from "./api";
import { Dashboard } from "./Dashboard";
import { Templates } from "./Templates";
import { Users } from "./Users";
import type { Me, Period, User } from "./types";
import { cx } from "./ui";

type Tab = "close" | "templates" | "users";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [tab, setTab] = useState<Tab>("close");
  const [fatal, setFatal] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const loadUsers = useCallback(() => {
    api.get<User[]>("/users").then(setUsers).catch(() => {});
  }, []);
  const loadPeriods = useCallback(() => {
    api.get<Period[]>("/periods").then(setPeriods).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<Me>("/me")
      .then((m) => {
        setMe(m);
        loadUsers();
        loadPeriods();
      })
      .catch((e) => setFatal(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setReady(true));
  }, [loadUsers, loadPeriods]);

  if (!ready) {
    return <div className="grid h-full place-items-center text-sm text-slate-400">Loading…</div>;
  }

  if (fatal || !me) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow ring-1 ring-slate-200">
          <h1 className="mb-2 text-lg font-semibold text-slate-900">Cannot sign you in</h1>
          <p className="text-sm text-slate-600">{fatal ?? "Unknown error."}</p>
        </div>
      </div>
    );
  }

  const isAdmin = me.system_role === "admin";

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Greyloch · Month-End Close</h1>
        </div>
        <nav className="flex gap-1 rounded-lg bg-slate-200/60 p-0.5 text-sm">
          <TabBtn active={tab === "close"} onClick={() => setTab("close")}>Close</TabBtn>
          {isAdmin && <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>Templates</TabBtn>}
          {isAdmin && <TabBtn active={tab === "users"} onClick={() => setTab("users")}>Users</TabBtn>}
        </nav>
        <div className="flex-1" />
        {me.dev_mode && <DevSwitcher users={users} current={me.email} />}
        <div className="text-right">
          <div className="text-sm font-medium text-slate-800">{me.name}</div>
          <div className="text-xs text-slate-400">{me.system_role}</div>
        </div>
      </header>

      <main className="flex-1">
        {tab === "close" && (
          <Dashboard me={me} users={users} periods={periods} onPeriodsChanged={loadPeriods} />
        )}
        {tab === "templates" && isAdmin && <Templates users={users} />}
        {tab === "users" && isAdmin && <Users users={users} onChanged={loadUsers} />}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

// Local-dev only: "act as" a different seeded user to test roles/permissions.
function DevSwitcher({ users, current }: { users: User[]; current: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 ring-1 ring-inset ring-amber-200">
      <span className="text-[10px] font-semibold uppercase text-amber-600">Dev: act as</span>
      <select
        className="bg-transparent text-xs text-amber-800 focus:outline-none"
        value={current}
        onChange={(e) => {
          setDevEmail(e.target.value);
          location.reload();
        }}
      >
        {!users.some((u) => u.email === current) && <option value={current}>{current}</option>}
        {users.map((u) => (
          <option key={u.id} value={u.email}>
            {u.name} ({u.system_role})
          </option>
        ))}
      </select>
      {getDevEmail() && (
        <button
          className="text-[10px] text-amber-600 hover:underline"
          onClick={() => {
            setDevEmail(null);
            location.reload();
          }}
          title="Clear override (use DEV_EMAIL default)"
        >
          reset
        </button>
      )}
    </div>
  );
}
