import { useRef, useState } from "react";
import { api, ApiError } from "./api";
import { Button, cx } from "./ui";

interface ReconResult {
  summary: {
    statementCount: number;
    statementTotal: number;
    qboCount: number;
    qboTotal: number;
    matchedCount: number;
    difference: number;
  };
  missingInQbo: { invoice: string; date: string; amount: number; description: string }[];
  extraInQbo: { docNumber: string; date: string; amount: number }[];
  amountMismatch: { invoice: string; statementAmount: number; qboAmount: number; diff: number }[];
}
interface ReconResponse {
  statement: { invoiceCount: number; totalCharges: number; totalCredits: number };
  reconcile: ReconResult | null;
  note?: string;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function ReconcilePanel({ taskId }: { taskId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ReconResponse | null>(null);

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setRes(await api.upload<ReconResponse>(`/tasks/${taskId}/reconcile`, fd));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const r = res?.reconcile;
  return (
    <section className="space-y-3 rounded-lg bg-slate-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Statement reconciliation
      </h3>
      <p className="text-xs text-slate-500">
        Upload the Advanced Hardware statement PDF to check it against the bills in QuickBooks.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 file:ring-1 file:ring-inset file:ring-slate-300"
        />
        <Button variant="primary" disabled={busy || !fileName} onClick={run}>
          {busy ? "Reconciling…" : "Run reconciliation"}
        </Button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {res && (
        <div className="space-y-3 text-sm">
          <div className="text-slate-600">
            Statement: <span className="font-medium">{res.statement.invoiceCount}</span> invoices ·{" "}
            <span className="font-medium">{money(res.statement.totalCharges)}</span> in charges
          </div>

          {!r && res.note && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-700 ring-1 ring-inset ring-amber-200">
              {res.note}
            </div>
          )}

          {r && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-white p-3 ring-1 ring-slate-200">
                <Stat label="Matched" value={`${r.summary.matchedCount} / ${r.summary.statementCount}`} />
                <Stat label="QuickBooks bills" value={String(r.summary.qboCount)} />
                <Stat label="Statement total" value={money(r.summary.statementTotal)} />
                <Stat label="QuickBooks total" value={money(r.summary.qboTotal)} />
                <Stat
                  label="Difference"
                  value={money(r.summary.difference)}
                  alert={Math.abs(r.summary.difference) > 0.005}
                />
              </div>

              <ExceptionList
                title="On statement, missing in QuickBooks"
                items={r.missingInQbo.map((m) => `#${m.invoice} · ${money(m.amount)} · ${m.description}`)}
                tone="rose"
              />
              <ExceptionList
                title="Amount mismatches"
                items={r.amountMismatch.map(
                  (m) => `#${m.invoice}: statement ${money(m.statementAmount)} vs QBO ${money(m.qboAmount)} (${money(m.diff)})`,
                )}
                tone="amber"
              />
              <ExceptionList
                title="In QuickBooks, not on statement"
                items={r.extraInQbo.map((m) => `#${m.docNumber} · ${money(m.amount)} · ${m.date}`)}
                tone="slate"
              />
              {r.missingInQbo.length === 0 && r.amountMismatch.length === 0 && r.extraInQbo.length === 0 && (
                <div className="rounded-md bg-brand-50 px-3 py-2 text-brand ring-1 ring-inset ring-brand/30">
                  Fully reconciled — every statement invoice matches QuickBooks.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={cx("font-medium tabular-nums", alert ? "text-rose-600" : "text-slate-700")}>{value}</span>
    </div>
  );
}

function ExceptionList({ title, items, tone }: { title: string; items: string[]; tone: "rose" | "amber" | "slate" }) {
  if (items.length === 0) return null;
  const toneCls = {
    rose: "text-rose-700",
    amber: "text-amber-700",
    slate: "text-slate-600",
  }[tone];
  const shown = items.slice(0, 50);
  return (
    <div>
      <div className={cx("mb-1 text-xs font-semibold", toneCls)}>
        {title} ({items.length})
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md bg-white p-2 text-xs text-slate-600 ring-1 ring-slate-200">
        {shown.map((line, i) => (
          <li key={i} className="truncate">{line}</li>
        ))}
        {items.length > shown.length && (
          <li className="text-slate-400">…and {items.length - shown.length} more</li>
        )}
      </ul>
    </div>
  );
}
