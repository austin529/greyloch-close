import { useState } from "react";
import { api, ApiError } from "./api";
import { Modal } from "./Dashboard";
import type { SystemRole, User } from "./types";
import { Button, cx, Field, inputCls } from "./ui";

const ROLES: SystemRole[] = ["admin", "staff", "viewer"];
const empty: Partial<User> = { email: "", name: "", system_role: "staff", active: 1 };

export function Users({ users, onChanged }: { users: User[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(u: Partial<User>) {
    setError(null);
    try {
      if (u.id) await api.patch(`/users/${u.id}`, u);
      else await api.post("/users", u);
      setEditing(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Email must match exactly what Cloudflare Access / Entra ID passes. Roles set the global capability ceiling.
        </p>
        <Button variant="primary" onClick={() => setEditing({ ...empty })}>
          + Add user
        </Button>
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={cx("border-t border-slate-100", !u.active && "opacity-50")}>
                <td className="px-4 py-2 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-2 text-slate-500">{u.email}</td>
                <td className="px-4 py-2">
                  <RoleBadge role={u.system_role} />
                </td>
                <td className="px-4 py-2 text-slate-500">{u.active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-2 text-right">
                  <button className="text-slate-500 hover:text-slate-900" onClick={() => setEditing({ ...u })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit user" : "Add user"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Name">
              <input
                className={inputCls}
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                value={editing.email ?? ""}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <select
                className={inputCls}
                value={editing.system_role ?? "staff"}
                onChange={(e) => setEditing({ ...editing, system_role: e.target.value as SystemRole })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })}
              />
              Active
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!editing.name?.trim() || !editing.email?.trim()}
                onClick={() => save(editing)}
              >
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: SystemRole }) {
  const cls = {
    admin: "bg-violet-50 text-violet-700 ring-violet-200",
    staff: "bg-slate-100 text-slate-600 ring-slate-200",
    viewer: "bg-slate-50 text-slate-400 ring-slate-200",
  }[role];
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", cls)}>
      {role}
    </span>
  );
}
