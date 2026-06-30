import type { StatementLine } from "./parse";

// A QuickBooks bill, as we pull it for the vendor (DocNumber = invoice #).
export interface QboBill {
  docNumber: string;
  txnDate: string;
  totalAmt: number;
}

export interface ReconcileResult {
  summary: {
    statementCount: number;
    statementTotal: number;
    qboCount: number;
    qboTotal: number;
    matchedCount: number;
    difference: number; // statementTotal - qboTotal
  };
  // On the statement but no matching bill in QuickBooks.
  missingInQbo: { invoice: string; date: string; amount: number; description: string }[];
  // A bill in QuickBooks with no matching statement line (e.g. debit memos).
  extraInQbo: { docNumber: string; date: string; amount: number }[];
  // Same invoice #, but the amounts differ.
  amountMismatch: { invoice: string; statementAmount: number; qboAmount: number; diff: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const CENT = 0.005;

/**
 * Reconcile parsed statement lines against QuickBooks bills, matched on
 * invoice number (statement) == DocNumber (QBO). A statement line's "charge"
 * is compared to the bill's total.
 */
export function reconcile(statement: StatementLine[], bills: QboBill[]): ReconcileResult {
  const billByDoc = new Map<string, QboBill>();
  for (const b of bills) billByDoc.set(b.docNumber, b);
  const matchedDocs = new Set<string>();

  const missingInQbo: ReconcileResult["missingInQbo"] = [];
  const amountMismatch: ReconcileResult["amountMismatch"] = [];
  let matchedCount = 0;

  for (const line of statement) {
    const bill = billByDoc.get(line.invoice);
    if (!bill) {
      missingInQbo.push({
        invoice: line.invoice,
        date: line.date,
        amount: line.charges,
        description: line.description,
      });
      continue;
    }
    matchedDocs.add(line.invoice);
    if (Math.abs(line.charges - bill.totalAmt) > CENT) {
      amountMismatch.push({
        invoice: line.invoice,
        statementAmount: line.charges,
        qboAmount: bill.totalAmt,
        diff: round2(line.charges - bill.totalAmt),
      });
    } else {
      matchedCount++;
    }
  }

  const extraInQbo = bills
    .filter((b) => !matchedDocs.has(b.docNumber))
    .map((b) => ({ docNumber: b.docNumber, date: b.txnDate, amount: b.totalAmt }));

  const statementTotal = round2(statement.reduce((s, l) => s + l.charges, 0));
  const qboTotal = round2(bills.reduce((s, b) => s + b.totalAmt, 0));

  return {
    summary: {
      statementCount: statement.length,
      statementTotal,
      qboCount: bills.length,
      qboTotal,
      matchedCount,
      difference: round2(statementTotal - qboTotal),
    },
    missingInQbo,
    extraInQbo,
    amountMismatch,
  };
}
