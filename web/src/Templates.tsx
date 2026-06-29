import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { Modal } from "./Dashboard";
import type { Template, User } from "./types";
import { Button, cx, Field, inputCls } from "./ui";

const empty: Partial<Template> = {
  name: "",
  category: "",
  sequence: 0,
  requires_review: 1,
  active: 1,
  default_preparer_id: null,
  default_reviewer_id: null,
};

export function Templates({ users }: { users: User[] }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setTemplates(await api.get<Template[]>("/templates?all=1"));
  }
  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  const activeUsers = users.filter((u) => u.active);
  const name = (id: number | null) => users.find((u) => u.id === id)?.name ?? "—";

  async function save(t: Partial<Template>) {
    setError(null);
    try {
      if (t.id) await api.patch(`/templates/${t.id}`, t);
      else await api.post("/templates", t);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function toggleActive(t: Template) {
    await api.patch(`/templates/${t.id}`, { active: t.active ? 0 : 1 });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          The master checklist. Editing a template affects only <em>future</em> periods — already-opened tasks keep their copied values.
        </p>
        <Button variant="primary" onClick={() => setEditing({ ...empty })}>
          + New template
        </Button>
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Day</th>
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Default preparer</th>
              <th className="px-4 py-2 font-medium">Default reviewer</th>
              <th className="px-4 py-2 font-medium">Review?</th>
              <th className="px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className={cx("border-t border-slate-100", !t.active && "opacity-50")}>
                <td className="px-4 py-2 tabular-nums text-slate-400">{t.sequence}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{t.name}</td>
                <td className="px-4 py-2 text-slate-500">{t.category || "—"}</td>
                <td className="px-4 py-2 text-slate-500">{name(t.default_preparer_id)}</td>
                <td className="px-4 py-2 text-slate-500">{name(t.default_reviewer_id)}</td>
                <td className="px-4 py-2">{t.requires_review ? "Yes" : "No"}</td>
                <td className="px-4 py-2">
                  <button className="text-slate-500 hover:underline" onClick={() => toggleActive(t)}>
                    {t.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <button className="text-slate-500 hover:text-slate-900" onClick={() => setEditing({ ...t })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit template" : "New template"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Task name">
              <input
                className={inputCls}
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <input
                  className={inputCls}
                  value={editing.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </Field>
              <Field label="Day of month">
                <input
                  type="number"
                  min={0}
                  max={31}
                  className={inputCls}
                  value={editing.sequence ?? 0}
                  onChange={(e) => setEditing({ ...editing, sequence: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default preparer">
                <select
                  className={inputCls}
                  value={editing.default_preparer_id ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, default_preparer_id: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">— none —</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default reviewer">
                <select
                  className={inputCls}
                  value={editing.default_reviewer_id ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, default_reviewer_id: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">— none —</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!editing.requires_review}
                onChange={(e) => setEditing({ ...editing, requires_review: e.target.checked ? 1 : 0 })}
              />
              Requires review (reviewer must sign off after preparer)
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" disabled={!editing.name?.trim()} onClick={() => save(editing)}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
