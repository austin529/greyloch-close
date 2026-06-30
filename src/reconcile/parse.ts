// Parse an Advanced Hardware Supply "Statement of Account" PDF (already
// extracted to text) into invoice line items.
//
// The statement lays each line out as:
//   DATE  INVOICE#  CHARGES  CREDITS  AMOUNT-DUE  DESCRIPTION  BALANCE
// We walk the token stream (rather than rely on line grouping) so it survives
// differences in how a given PDF text extractor orders/wraps tokens: a record
// starts at a DATE immediately followed by an INVOICE number, then the next
// three money tokens are charges/credits/amount-due, the trailing text is the
// description, and the final money token is the running balance.

export interface StatementLine {
  date: string;
  invoice: string;
  charges: number;
  credits: number;
  amountDue: number;
  description: string;
  balance: number | null;
}

export interface ParsedStatement {
  lines: StatementLine[];
  totalCharges: number;
  totalCredits: number;
  invoiceCount: number;
}

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
// Money: optional minus, digits (commas allowed but not required), two decimals.
const MONEY = /^-?\d[\d,]*\.\d{2}$/;
const INVOICE = /^\d{5,8}$/;

const toNum = (s: string) => parseFloat(s.replace(/,/g, ""));
const round2 = (n: number) => Math.round(n * 100) / 100;

function isRecordStart(tokens: string[], i: number): boolean {
  return DATE.test(tokens[i]) && i + 1 < tokens.length && INVOICE.test(tokens[i + 1]);
}

export function parseAhsStatement(text: string): ParsedStatement {
  const tokens = text.split(/\s+/).filter(Boolean);
  const lines: StatementLine[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isRecordStart(tokens, i)) {
      i++;
      continue;
    }
    const date = tokens[i];
    const invoice = tokens[i + 1];
    i += 2;

    const monies: number[] = [];
    while (i < tokens.length && monies.length < 3 && MONEY.test(tokens[i])) {
      monies.push(toNum(tokens[i]));
      i++;
    }
    const desc: string[] = [];
    while (i < tokens.length && !MONEY.test(tokens[i]) && !isRecordStart(tokens, i)) {
      desc.push(tokens[i]);
      i++;
    }
    let balance: number | null = null;
    if (i < tokens.length && MONEY.test(tokens[i])) {
      balance = toNum(tokens[i]);
      i++;
    }
    lines.push({
      date,
      invoice,
      charges: monies[0] ?? 0,
      credits: monies[1] ?? 0,
      amountDue: monies[2] ?? 0,
      description: desc.join(" ").slice(0, 60),
      balance,
    });
  }

  return {
    lines,
    invoiceCount: lines.length,
    totalCharges: round2(lines.reduce((s, l) => s + l.charges, 0)),
    totalCredits: round2(lines.reduce((s, l) => s + l.credits, 0)),
  };
}
