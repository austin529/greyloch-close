import type { Env } from "../types";
import type { QboBill } from "./match";

// Reads QuickBooks bills through the CData Connect Cloud query API (the same
// connection the team's other tools use). Configured via CDATA_* env/secrets;
// when unset, reconciliation runs statement-only.

export function qboConfigured(env: Env): boolean {
  return !!(env.CDATA_API_URL && env.CDATA_USERNAME && env.CDATA_TOKEN);
}

interface FetchOpts {
  vendorLike: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/**
 * Fetch a vendor's bills (DocNumber, TxnDate, TotalAmt) for a date window.
 * Uses CData's parameterized query API to avoid any SQL injection.
 */
export async function fetchVendorBills(env: Env, opts: FetchOpts): Promise<QboBill[]> {
  const query =
    "SELECT [DocNumber], [TxnDate], [TotalAmt] " +
    "FROM [QuickBooksOnline1].[QuickBooksOnline].[Bills] " +
    "WHERE [VendorRef_Name] LIKE @vendor AND [TxnDate] >= @start AND [TxnDate] <= @end";

  const res = await fetch(env.CDATA_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${env.CDATA_USERNAME}:${env.CDATA_TOKEN}`),
    },
    body: JSON.stringify({
      query,
      parameters: { "@vendor": opts.vendorLike, "@start": opts.start, "@end": opts.end },
      parameterTypes: { "@vendor": "VARCHAR", "@start": "VARCHAR", "@end": "VARCHAR" },
    }),
  });
  if (!res.ok) {
    throw new Error(`CData query failed (${res.status}): ${await res.text().catch(() => "")}`);
  }

  // CData Connect returns { results: [{ schema, rows }] }; rows are arrays in
  // column order, or objects keyed by column. Handle both shapes defensively.
  const data = (await res.json()) as any;
  const block = data?.results?.[0] ?? data;
  const rows: unknown[] = block?.rows ?? block?.Rows ?? [];
  const bills: QboBill[] = [];
  for (const row of rows) {
    let doc: unknown, date: unknown, amt: unknown;
    if (Array.isArray(row)) {
      [doc, date, amt] = row;
    } else if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      doc = r.DocNumber ?? r.docNumber;
      date = r.TxnDate ?? r.txnDate;
      amt = r.TotalAmt ?? r.totalAmt;
    }
    if (doc == null) continue;
    bills.push({
      docNumber: String(doc),
      txnDate: date ? String(date).slice(0, 10) : "",
      totalAmt: Number(amt) || 0,
    });
  }
  return bills;
}
