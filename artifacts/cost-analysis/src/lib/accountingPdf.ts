import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { AccountingReport, AffairsDetails } from "@workspace/api-client-react";
import { formatAccountingMoney } from "../../../../lib/api-client-react/src/accounting-report-format";

export type AccountingPdfSource = AccountingReport | AffairsDetails;
type Section = { title: string; headers: string[]; rows: string[][]; numeric?: number[] };
export type AccountingPdfModel = {
  title: string; filename: string; identity: string; snapshot: string;
  orientation: "portrait" | "landscape"; context: string[][]; warnings: string[]; sections: Section[];
};
const titles = { "general-ledger": "General Ledger", "trial-balance": "Trial Balance", "balance-sheet": "Balance Sheet", "management-accounts": "Management Accounts" };
const text = (value: unknown) => value == null ? "Not recorded" : String(value);
const money = (value: string | null) => value === null ? "Not available" : formatAccountingMoney(value);
const section = (title: string, headers: string[], rows: unknown[][], numeric?: number[]): Section => ({ title, headers, rows: rows.map(row => row.map(text)), numeric });
const controls = (title: string, rows: unknown[][]) => section(title, ["Measure", "Value"], rows, [1]);

// All amounts come from the authorised snapshot; export never recalculates or fetches finances.
export function accountingPdfModel(source: AccountingPdfSource): AccountingPdfModel {
  if (!("kind" in source)) return affairsModel(source);
  const r = source, s = r.statements;
  if ((r.kind === "balance-sheet" || r.kind === "management-accounts") && !s) throw new Error("Statement snapshot is unavailable. No PDF totals were inferred.");
  const sections: Section[] = [controls("Posted Report Controls", [
    ["Period debit", money(r.totals.debit)], ["Period credit", money(r.totals.credit)],
    ["Opening difference", money(r.totals.openingDifference)], ["Movement difference", money(r.totals.movementDifference)],
    ["Closing difference", money(r.totals.closingDifference)], ["Displayed debit/credit equality", r.balanced ? "Balanced" : "Not balanced"],
    ["Source completeness independently confirmed", String(r.sourceCompletenessConfirmed)],
  ])];
  if (r.kind === "general-ledger") {
    for (const a of r.rows) sections.push(section(
      `${a.code} - ${a.name} (${a.category}${a.active ? "" : "; inactive"})\nOpening signed balance: ${money(a.opening)} | Closing signed balance: ${money(a.closing)}`,
      ["Date", "Journal / source / branch", "Narration / memo", "Debit", "Credit", "Running Dr (+) / Cr (-)"],
      [...a.entries.map(e => [e.date, `Journal #${e.journalId}\n${e.eventKey}\nBranch #${e.branchId}`, `${e.narration}${e.memo ? `\n${e.memo}` : ""}`, money(e.debit), money(e.credit), money(e.balance)]),
        ["Period movements / closing", "", "", money(a.debit), money(a.credit), money(a.closing)]], [3, 4, 5]));
  } else if (r.kind === "trial-balance") {
    sections.push(section("Trial Balance", ["Account / category", "Opening Dr", "Opening Cr", "Period Dr", "Period Cr", "Closing Dr", "Closing Cr"],
      [...r.rows.map(a => [`${a.code} ${a.name}\n${a.category}${a.active ? "" : " / inactive"}`, ...[a.openingSides.debit, a.openingSides.credit, a.debit, a.credit, a.closingSides.debit, a.closingSides.credit].map(money)]),
        ["Totals", ...[r.totals.openingDebit, r.totals.openingCredit, r.totals.debit, r.totals.credit, r.totals.closingDebit, r.totals.closingCredit].map(money)]], [1, 2, 3, 4, 5, 6]));
  } else if (s) {
    const bs = s.balanceSheet;
    sections.push(section(`Balance Sheet at ${r.asOf}`, ["Account", "Category", "Normal-side closing balance"], bs.rows.map(a => [`${a.code} ${a.name}`, a.category, money(a.amount)]), [2]),
      controls("Balance Sheet Controls", [
        ["Assets", money(bs.assets)], ["Liabilities", money(bs.liabilities)], ["Posted equity including posted retained earnings", money(bs.postedEquity)],
        ["Prior-year unclosed earnings", money(bs.priorUnclosedEarnings)], [`Current financial-year earnings from ${bs.financialYearStart}`, money(bs.currentYearEarnings)],
        ["Equity including unclosed earnings", money(bs.equityIncludingEarnings)], ["Assets less liabilities and equity", money(bs.difference)],
        ["Equation", bs.balanced ? "Equation reconciles; not certification of complete company balances" : "Does not reconcile"],
      ]));
    if (r.kind === "management-accounts") {
      const pl = s.profitAndLoss, cf = s.cashFlow;
      sections.push(section("Accrual Profit and Loss - posted income and expenses, not cash collections", ["Account", "Category", "Period amount"], pl.rows.map(a => [`${a.code} ${a.name}`, a.category, money(a.amount)]), [2]),
        controls("Accrual Performance", [["Basis", pl.basis], ["Income", money(pl.income)], ["Expenses", money(pl.expense)], ["Net profit", money(pl.profit)]]),
        controls("Identified Cash Reconciliation", [
          ["Basis", cf.basis], ["Cash controls identified from reviewed mappings", String(cf.identified)], ["Cash control account IDs", cf.accountIds.join(", ") || "None identified"],
          ["Classification", cf.classificationsComplete ? "All identified movements classified" : "Review required; not fully classified statutory cash flow"],
          ...([["Opening cash", cf.opening], ["Operating", cf.operating], ["Investing", cf.investing], ["Financing", cf.financing], ["Internal transfers (net)", cf.transfers],
            ["Unclassified movement", cf.unclassified], ["Net movement", cf.movement], ["Closing identified cash", cf.closing], ["Opening + movement versus closing difference", cf.difference]] as const).map(([label, value]) => [label, money(value)]),
        ]),
        section("Cash Source Drilldown", ["Date", "Journal / source", "Branch", "Classification", "Net cash"], cf.entries.map(e => [e.date, `Journal #${e.journalId}\n${e.eventKey}`, e.branchId, e.classification, money(e.amount)]), [4]),
        section("Profit-to-Cash Bridge - balance movements, not a second cash calculation", ["Account", "Adjustment to accrual profit"], cf.profitBridge.adjustments.map(a => [`${a.code} ${a.name}`, money(a.adjustment)]), [1]),
        controls("Profit Bridge Controls", [["Accrual profit", money(cf.profitBridge.profit)], ["Cash movement", money(cf.profitBridge.cashMovement)], ["Bridge difference", money(cf.profitBridge.difference)]]));
      for (const [title, aging] of [["Receivables", s.receivables], ["Payables", s.payables]] as const) {
        sections.push(controls(`${title} Posted Open-Item Controls`, [
          ["Controls identified from reviewed mappings", String(aging.identified)], ["Control account IDs", aging.controlAccounts.join(", ") || "None identified"],
          ["Supported open items", money(aging.total)], ["Identified control balance", money(aging.controlBalance)], ["Unallocated control difference", money(aging.unallocatedControl)],
          ["Retained due dates complete", String(aging.dueDatesComplete)], ["Completeness boundary", "Opening detail is not invented; missing due dates remain Undated, never guessed overdue."],
        ]), section(`${title} Aging Buckets`, ["Bucket", "Balance"], aging.buckets.map(b => [b.bucket, money(b.amount)]), [1]),
        section(`${title} Source Balances`, ["Branch / source", "Party / control accounts", "Recognised", "Retained due date", "Days overdue / bucket", "Balance"],
          aging.rows.map(a => [`Branch #${a.branchId}\nSource #${a.sourceId}`, `Party: ${a.partyId ?? "Unspecified"}\nAccounts: ${a.accountIds.join(", ")}`, a.recognitionDate, a.dueDate ?? "Not retained", `${a.daysOverdue ?? "Undated"}\n${a.bucket}`, money(a.balance)]), [5]));
      }
      sections.push(section("Posted Branch Performance - one selected book, not legal-group consolidation", ["Branch", "Accrual income", "Accrual expense", "Net profit", "Identified cash movement"],
        s.branchPerformance.map(b => [`${r.branches.find(x => x.id === b.branchId)?.name ?? `Branch #${b.branchId}`}`, ...[b.income, b.expense, b.profit, b.cashMovement].map(money)]), [1, 2, 3, 4]),
      section("Job Performance - period actuals versus current lifetime operational estimates, not approved budget variance", ["Container / branch", "Income", "Expense", "Profit", "Current budget revenue", "Current budget cost", "Income minus budget", "Cost minus budget"],
        s.jobPerformance.rows.map(j => [`${j.name}\nContainer #${j.containerId} / Branch #${j.branchId}`, ...[j.income, j.expense, j.profit, j.budgetRevenue, j.budgetCost, j.revenueVariance, j.costVariance].map(money)]), [1, 2, 3, 4, 5, 6, 7]),
      controls("Unallocated Job Amounts - included in full P&L; shared B/L totals are not repeated per container", [["Income / adjustments", money(s.jobPerformance.unallocatedIncome)], ["Expenses / overhead", money(s.jobPerformance.unallocatedExpense)]]));
    }
  }
  if (r.rows.length === 0 && !s) sections.push(controls("No Matching Accounts", [["Result", "No chart accounts match this posted scope and visibility filter. No balances are inferred."]]));
  for (const c of r.coverage) sections.push(controls(`Source Coverage - Branch #${c.branchId}`, [
    ["Through", r.asOf], ["Exception count", c.exceptionCount], ["Shown exceptions truncated", String(c.exceptionsTruncated)],
    ["Independent controls verified", String(c.independentControlsVerified)], ["Source status counts", JSON.stringify(c.counts)],
    ["Missing control account IDs", c.missingControlAccountIds.join(", ") || "None used"],
  ]), section(`Source Exceptions - Branch #${c.branchId}`, ["Date", "Source event / kind / ID", "Status", "Reason"], c.exceptions.map(e => [e.date, `${e.eventKey}\n${e.kind} #${e.id}`, e.status, e.reason])));
  return {
    title: titles[r.kind], filename: `${r.kind}_${r.book.id}_${r.filter.from}_${r.asOf}.pdf`, identity: `Book #${r.book.id} | ${r.scope === "whole_book" ? "Whole selected book" : "Branch view"}`, snapshot: r.generatedAt, orientation: "landscape",
    context: [["Book", r.book.name], ["Currency / accounting basis", `${r.book.currency} / ${r.basis}`], ["Period", `${r.filter.from} through ${r.asOf}`],
      ["Scope", `${r.scope === "whole_book" ? "Whole selected book" : "Branch view"}: ${r.branches.map(b => `${b.name} (#${b.id})`).join(", ")}`],
      ["Applied snapshot", r.generatedAt], ["Policy / cutover", `${r.book.policyVersion} / ${r.book.cutoverDate}`],
      ["Applied filters", `Account: ${r.filter.accountId ?? "all"}; period: ${r.filter.periodId ?? "custom dates"}; zero accounts: ${r.filter.includeZero}; unused inactive: ${r.filter.includeInactive}`],
      ["Source row limit / truncated", `${r.limit} / ${r.truncated}`]],
    warnings: [...new Set([...r.warnings, ...(s?.warnings ?? []), "Debit/credit equality is not proof of source completeness or independently reconciled company accounts.",
      ...(r.truncated ? ["SOURCE SNAPSHOT TRUNCATED: this PDF contains only the displayed snapshot. It is not the complete ledger."] : [])])], sections,
  };
}

function affairsModel(e: AffairsDetails): AccountingPdfModel {
  const p = e.payload, r = p.request, t = p.totals;
  return {
    title: "Statement of Affairs", filename: `statement-of-affairs_${e.id}_${r.asOf}.pdf`, identity: `Book #${p.bookId} | Branch #${p.branchId} | Version #${e.id} | ${e.state.toUpperCase()}${e.superseded ? " - HISTORICAL / SUPERSEDED" : ""}`, snapshot: e.reviewedAt ?? e.createdAt, orientation: "portrait",
    context: [["Title", r.title], ["As of / currency", `${r.asOf} / ${p.currency}`], ["Version / state", `#${e.id} / ${e.state.toUpperCase()}${e.superseded ? " - HISTORICAL / SUPERSEDED" : ""}`],
      ["Prepared / preparer", `${e.createdAt} / #${e.preparedBy}`], ["Reviewed / reviewer", `${e.reviewedAt ?? "Not recorded"} / ${e.reviewedBy == null ? "Not reviewed" : `#${e.reviewedBy}`}`],
      ["Replaces", e.replacesId == null ? "No earlier version" : `#${e.replacesId}`], ["Scope / supporting schedule", r.scopeEvidence], ["Limitations / missing records", r.limitations], ["Review decision evidence", e.decisionReason ?? "Pending independent review"]],
    warnings: [...p.warnings, "Valuation schedule only; no ledger posting or statutory certification is created by this download."],
    sections: [controls("Valuation Totals", [["Assets", money(t.assets)], ["Liabilities", money(t.liabilities)], ["Net assets / (deficiency)", money(t.netAssets)],
      ["Estimated lines", t.estimatedLines], ["Unknown book values", t.unknownBookValues], ["Declared book asset subtotal (incomplete when unknown)", money(t.declaredBookAssets)], ["Declared book liability subtotal (incomplete when unknown)", money(t.declaredBookLiabilities)]]),
      ...(["asset", "liability"] as const).flatMap(category => {
        const lines = r.lines.filter(l => l.category === category);
        return lines.length ? lines.map(l => controls(`${category === "asset" ? "Asset" : "Liability"} Schedule - ${l.name}`, [
          ["Schedule identity", l.key], [`Valuation (${p.currency})`, money(l.value)], ["Basis", l.basis === "estimate" ? "ESTIMATED" : "DECLARED BOOK VALUE"],
          ["Book carrying amount", l.bookValue === null ? "Unknown (not zero)" : money(l.bookValue)], ["Basis explanation", l.basisExplanation], ["Supporting evidence", l.evidence],
        ])) : [controls(`${category} Schedule`, [["No lines supplied", "Not evidence of a zero balance or complete records."]])];
      }),
      section("Audit History", ["Timestamp", "Actor / action", "Reason"], e.audit.map(a => [a.createdAt, `#${a.actorId} / ${a.action}`, a.reason]))],
  };
}

export function createAccountingPdf(source: AccountingPdfSource) {
  const model = accountingPdfModel(source);
  const doc = new jsPDF({ orientation: model.orientation, unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.setProperties({ title: `${model.title} - ${model.identity}`, subject: `Authorised applied snapshot ${model.snapshot}`, creator: "Cost Management System" });
  let y = 72;
  const tables: Section[] = [section("Applied Report Context", ["Field", "Value"], model.context), section("Reporting Controls and Limitations", ["Warning"], model.warnings.map(w => [w])), ...model.sections];
  for (const table of tables) {
    autoTable(doc, {
      startY: y, margin: { top: 72, bottom: 38, left: 36, right: 36 }, tableWidth: "auto",
      head: [[{ content: table.title, colSpan: table.headers.length, styles: { halign: "left", fontSize: 10, fillColor: [30, 41, 59], textColor: 255 } }], table.headers],
      body: table.rows.length ? table.rows : [[{ content: "No matching rows in this snapshot.", colSpan: table.headers.length }]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top", textColor: [15, 23, 42], lineWidth: 0.25, lineColor: [215, 222, 232] },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" }, alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries((table.numeric ?? []).map(i => [i, { halign: "right" }])),
      pageBreak: "avoid", rowPageBreak: "avoid", showHead: "everyPage",
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
    doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(model.title, 36, 28);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(model.identity, width - 72), 36, 43);
    doc.setDrawColor(203, 213, 225); doc.line(36, height - 28, width - 36, height - 28);
    doc.setFontSize(7); doc.setTextColor(80);
    doc.text(`Snapshot: ${model.snapshot}`, 36, height - 16);
    doc.text(`Page ${page} of ${pages}`, width - 36, height - 16, { align: "right" });
  }
  return { document: doc, filename: model.filename };
}
