import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import { getPeriod, getTask, logActivity } from "../db";
import { parseAhsStatement } from "../reconcile/parse";
import { reconcile as runReconcile } from "../reconcile/match";
import { fetchVendorBills, qboConfigured } from "../reconcile/qbo";
import type { AppContext } from "../types";
import { badRequest, forbidden, isAdmin, isPreparer, isReviewer, notFound, parseId, requireOpenPeriod, requireWriter } from "../util";

export const reconcileRoutes = new Hono<AppContext>();

// Vendor statement reconciliation (currently Advanced Hardware Supply).
const VENDOR_LIKE = "%Advanced Hardware%";

function toIso(mmddyyyy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mmddyyyy);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

// Upload an AHS statement PDF; parse it and (when QBO is connected) reconcile
// against the vendor's bills. Returns the statement summary + exception report.
reconcileRoutes.post("/tasks/:id/reconcile", async (c) => {
  const user = c.get("user");
  requireWriter(user);
  const id = parseId(c.req.param("id"));
  const task = await getTask(c.env.DB, id);
  if (!task) notFound("Task not found.");
  if (!isAdmin(user) && !isPreparer(user, task) && !isReviewer(user, task)) {
    forbidden("Only the assigned preparer/reviewer or an admin can reconcile this task.");
  }
  // Closed periods are read-only (matches every other task mutation).
  requireOpenPeriod(await getPeriod(c.env.DB, task.period_id));

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) badRequest("Attach the statement PDF as 'file'.");
  if (file.size > 25 * 1024 * 1024) badRequest("PDF is too large (max 25 MB).");

  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  } catch (err) {
    badRequest(`Could not read the PDF: ${(err as Error).message}`);
  }

  const parsed = parseAhsStatement(text!);
  if (parsed.invoiceCount === 0) {
    badRequest("No invoice lines found — is this an Advanced Hardware statement PDF?");
  }

  const statementSummary = {
    invoiceCount: parsed.invoiceCount,
    totalCharges: parsed.totalCharges,
    totalCredits: parsed.totalCredits,
  };

  if (!qboConfigured(c.env)) {
    return c.json({
      statement: statementSummary,
      reconcile: null,
      note: "Parsed the statement. QuickBooks isn't connected yet, so the bill match is pending — add the CData credentials to enable it.",
    });
  }

  const dates = parsed.lines.map((l) => toIso(l.date)).filter(Boolean).sort();
  const bills = await fetchVendorBills(c.env, {
    vendorLike: VENDOR_LIKE,
    start: dates[0],
    end: dates[dates.length - 1],
  });
  const result = runReconcile(parsed.lines, bills);

  await logActivity(c.env.DB, {
    task_id: id,
    period_id: task.period_id,
    user_id: user.id,
    action: "reconciled",
    detail:
      `AHS statement reconciled: ${result.summary.matchedCount}/${result.summary.statementCount} matched, ` +
      `${result.missingInQbo.length} missing in QBO, ${result.amountMismatch.length} mismatched, ` +
      `${result.extraInQbo.length} extra in QBO.`,
  });

  return c.json({ statement: statementSummary, reconcile: result });
});
