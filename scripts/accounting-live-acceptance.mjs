// One bounded live dummy-data acceptance; secrets/cookies stay in memory.
import assert from "node:assert/strict";

const adjustmentsOnly = process.argv.includes("--adjustments");
const classificationOnly = process.argv.includes("--classification");
const staffAccessOnly = process.argv.includes("--staff-access");
assert(process.argv.includes(classificationOnly ? "--confirm=LIVE-ACCT-STEPS45-20261010" : adjustmentsOnly ? "--confirm=LIVE-ACCT-STEP3-20261010" : "--confirm=LIVE-ACCT-STEPS12-20261008"), "Explicit live test confirmation required");
const inspectOnly = process.argv.includes("--inspect-only");
const base = "https://donclimaxmanagementapp.com/api";
const label = classificationOnly ? "E2E-ACCT-20261010 Classification QA" : adjustmentsOnly ? "E2E-ACCT-20261010 Non-cash Adjustment QA" : "E2E-ACCT-20261008 Cash Settlement QA";
const cookies = new Map();
let branch = "all";
let csrf;
let input = "";
for await (const chunk of process.stdin) input += chunk;
const credential = JSON.parse(input);
input = "";

async function request(method, path, body, expected = 200) {
  const headers = { "Content-Type": "application/json", "X-Branch-Id": branch };
  if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const response = await fetch(base + path, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";", 1)[0];
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const data = await response.json();
  if (path !== "/auth/login") console.log(JSON.stringify({ method, path, http: response.status }));
  assert.equal(response.status, expected, `Unexpected HTTP ${response.status}: ${method} ${path}`);
  return data;
}
const equalMoney = (actual, expected, message) => assert.equal(Math.round(Number(actual) * 100), Math.round(expected * 100), message);
async function snapshot(bankId) {
  const ledger = await request("GET", "/reports/financial-ledger");
  const cashflow = await request("GET", "/reports/cashflow");
  const bank = await request("GET", `/banks/${bankId}/transactions`);
  const banks = await request("GET", "/banks");
  const listed = banks.find(row => row.id === bankId);
  assert(listed, "Missing scoped bank");
  return { ledger, cashflow, bank, bankBalance: listed.currentBalance };
}
function assertUnchangedCash(actual, expected) {
  assert.deepEqual(actual.ledger.summary, expected.ledger.summary, "Ledger cash changed after non-cash settlement");
  assert.deepEqual(actual.cashflow.totals, expected.cashflow.totals, "Cash Flow changed after non-cash settlement");
  equalMoney(actual.bank.closingBalance, expected.bank.closingBalance, "Bank statement changed");
  equalMoney(actual.bankBalance, expected.bankBalance, "Bank list changed");
}
function checkpoint(name, detail) { console.log(JSON.stringify({ pass: name, ...detail })); }

async function adjustmentAcceptance(selected, bank, existing) {
  const cashBefore = await snapshot(bank.id);
  const plBefore = await request("GET", "/reports/pl?costBasis=actual_paid");
  const vatBefore = await request("GET", "/reports/vat-summary");
  const trackingBefore = await request("GET", "/reports/vat-liability");
  const comparisonBefore = await request("GET", "/reports/branch-comparison");
  const branchBefore = comparisonBefore.rows.find(row => row.branchId === selected.id);
  assert(branchBefore);
  let client;
  let invoice;
  let containerId;
  let expenseId;
  if (inspectOnly) {
    assert.equal(existing.length, 1, "Adjustment fixture missing; inspection must not recreate it");
    client = existing[0];
    const invoices = (await request("GET", "/invoices")).filter(row => row.clientId === client.id);
    assert.equal(invoices.length, 1, "Expected exactly one retained adjustment invoice");
    invoice = await request("GET", `/invoices/${invoices[0].id}`);
  } else {
    assert.equal(existing.length, 0, "Adjustment fixture exists: inspect it, never repeat writes automatically");
    checkpoint("Step 3 live baseline", { ledger: cashBefore.ledger.summary, cashflow: cashBefore.cashflow.totals,
      bankBalance: cashBefore.bankBalance, revenue: plBefore.revenue.totalRevenue,
      badDebts: plBefore.adjustments.totalBadDebts, netProfit: plBefore.netProfit, vat: vatBefore.totals });
    client = await request("POST", "/clients", { name: label, branchId: selected.id,
      notes: "Owner-authorised dummy accounting acceptance; no real client, physical movement, cash or messages." }, 201);
    checkpoint("Step 3 controlled client", { clientId: client.id, branchId: selected.id });
    const container = await request("POST", "/containers", { containerNumber: "ACCT2610101", blNumber: "E2E-ACCT-STEP3-20261010",
      customerName: label, clientId: client.id, branchId: selected.id, command: "PTML", clearingCharges: 1000,
      declaration: "Dummy non-cash write-off/VAT test only; no operational progression." }, 201);
    containerId = container.id;
    const yesterday = new Date(Date.now() + 3600000 - 86400000).toISOString().slice(0, 10);
    const draft = await request("POST", "/invoices", { containerIds: [container.id], branchId: selected.id,
      vatRate: 7.5, dueDate: yesterday, notes: label }, 201);
    checkpoint("Step 3 controlled invoice/job", { containerId, invoiceId: draft.id, invoiceNumber: draft.invoiceNumber });
    await request("PATCH", `/invoices/${draft.id}`, { status: "sent" });
    invoice = await request("GET", `/invoices/${draft.id}`);
    equalMoney(invoice.subtotal, 1000); equalMoney(invoice.vatAmount, 75); equalMoney(invoice.total, 1075);
    const cn = await request("POST", `/invoices/${invoice.id}/credit-note`, { amount: 107.5,
      reason: "E2E-ACCT-20261010 dummy credit-note VAT/net recognition; no cash refund" }, 201);
    equalMoney(cn.appliedToInvoice, 107.5); equalMoney(cn.creditedToClient, 0);
    invoice = await request("GET", `/invoices/${invoice.id}`);
    equalMoney(invoice.outstanding, 967.5);
    const notePl = await request("GET", `/reports/pl?clientId=${client.id}&costBasis=actual_paid`);
    equalMoney(notePl.revenue.totalRevenue, 900); equalMoney(notePl.revenue.totalVatCollected, 67.5);
    const noteVat = await request("GET", "/reports/vat-summary");
    equalMoney(noteVat.totals.totalSubtotal, vatBefore.totals.totalSubtotal + 900);
    equalMoney(noteVat.totals.totalVat, vatBefore.totals.totalVat + 67.5);
    const note = noteVat.creditNotes.find(row => row.id === cn.id);
    assert(note); equalMoney(note.netAmount, 100); equalMoney(note.vatAmount, 7.5);
    assertUnchangedCash(await snapshot(bank.id), cashBefore);
    checkpoint("ACCT-004 live nonzero VAT credit note", { invoiceId: invoice.id, creditNoteId: cn.id,
      creditNoteNumber: cn.creditNoteNumber, netRevenue: 900, vatRetained: 67.5, outstanding: 967.5, cashUnchanged: true });
    const writtenOff = await request("POST", `/invoices/${invoice.id}/write-off`, {}, 201);
    expenseId = writtenOff.overheadExpenseId;
    equalMoney(writtenOff.writtenOffAmount, 967.5);
    checkpoint("ACCT-005 live write-off created", { invoiceId: invoice.id, overheadExpenseId: expenseId, writtenOffAmount: 967.5 });
    await request("POST", `/invoices/${invoice.id}/write-off`, {}, 400);
    await request("POST", `/overhead-expenses/${expenseId}/payments`, { amount: 1, paymentMethod: "bank", bankId: bank.id,
      reference: "E2E-ACCT-STEP3-REFUSED-NONCASH" }, 409);
    const evidence = (await request("GET", "/overhead-expenses")).expenses.find(row => row.id === expenseId);
    assert(evidence, "Write-off evidence missing from scoped expense list");
    assert.equal(evidence.status, "non_cash"); equalMoney(evidence.balance, 0); equalMoney(evidence.totalPaid, 0);
    invoice = await request("GET", `/invoices/${invoice.id}`);
  }
  assert.equal(invoice.status, "written_off");
  equalMoney(invoice.writtenOffAmount, 967.5); equalMoney(invoice.outstanding, 0); equalMoney(invoice.totalPaid, 107.5);
  assert.equal(invoice.creditNotes.length, 1); equalMoney(invoice.creditNotes[0].amount, 107.5);
  const clientPl = await request("GET", `/reports/pl?clientId=${client.id}&costBasis=actual_paid`);
  equalMoney(clientPl.revenue.totalRevenue, 900); equalMoney(clientPl.revenue.totalVatCollected, 67.5);
  equalMoney(clientPl.adjustments.totalBadDebts, 967.5); equalMoney(clientPl.netProfit, -67.5);
  assert.equal(clientPl.adjustments.badDebts.filter(row => row.invoiceId === invoice.id).length, 1);
  assert.equal(clientPl.adjustments.undatedBadDebts.includes(invoice.id), false);
  const ar = await request("GET", "/invoices/accounts-receivable");
  equalMoney(ar.clients.find(row => row.clientId === client.id)?.outstanding ?? 0, 0);
  const vat = await request("GET", "/reports/vat-summary");
  const tracking = await request("GET", "/reports/vat-liability");
  const pl = await request("GET", "/reports/pl?costBasis=actual_paid");
  const comparison = await request("GET", "/reports/branch-comparison");
  const currentBranch = comparison.rows.find(row => row.branchId === selected.id);
  assert(currentBranch);
  if (!inspectOnly) {
    equalMoney(pl.revenue.totalRevenue, plBefore.revenue.totalRevenue + 900);
    equalMoney(pl.adjustments.totalBadDebts, plBefore.adjustments.totalBadDebts + 967.5);
    equalMoney(pl.overheads.total, plBefore.overheads.total);
    equalMoney(pl.netProfit, plBefore.netProfit - 67.5);
    equalMoney(vat.totals.totalVat, vatBefore.totals.totalVat + 67.5);
    equalMoney(tracking.currentQuarter.vatCollected, trackingBefore.currentQuarter.vatCollected + 67.5);
    equalMoney(currentBranch.revenue, branchBefore.revenue + 900);
    equalMoney(currentBranch.badDebts, branchBefore.badDebts + 967.5);
    equalMoney(currentBranch.netProfit, branchBefore.netProfit - 67.5);
    equalMoney(currentBranch.outstandingReceivables, branchBefore.outstandingReceivables);
  }
  assertUnchangedCash(await snapshot(bank.id), cashBefore);
  const audit = await request("GET", `/invoices/${invoice.id}/audit-log`);
  assert.equal(audit.filter(row => row.action === "written_off").length, 1);
  checkpoint(inspectOnly ? "ACCT-005 retained fixture read-only reconciliation" : "ACCT-005 live cross-module reconciliation and duplicate refusal", { clientId: client.id, containerId,
    invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, overheadExpenseId: expenseId,
    writtenOffAmount: invoice.writtenOffAmount, outstanding: 0, settlement: invoice.totalPaid,
    clientNetRevenue: 900, clientVat: 67.5, clientResult: -67.5,
    branchRevenue: currentBranch.revenue, branchBadDebts: currentBranch.badDebts, branchNetProfit: currentBranch.netProfit,
    bankBalance: cashBefore.bankBalance, cashUnchanged: true, preservedForAudit: true });
}

async function classificationAcceptance(selected, bank) {
  let review = await request("GET", "/payment-schedules/accounting-review");
  const history = review.payments.filter(row => row.vendor !== label);
  checkpoint("ACCT-006 historical evidence inspection", { payments: history.map(row => ({ paymentId: row.id, scheduleId: row.scheduleId,
    amount: row.amount, vendor: row.vendor, description: row.description, reference: row.reference, notes: row.notes,
    classification: row.classification, version: row.classificationVersion })) });
  const schedules = (await request("GET", "/payment-schedules")).schedules.filter(row => row.vendorBeneficiary === label);
  assert(schedules.length <= 1, "Duplicate classification fixture");
  if (!inspectOnly) assert.equal(schedules.length, 0, "Existing classification fixture: inspect-only required; do not repeat cash writes");
  const before = await snapshot(bank.id);
  const plBefore = await request("GET", "/reports/pl?costBasis=actual_paid");
  const arBefore = await request("GET", "/invoices/accounts-receivable");
  const vatBefore = await request("GET", "/reports/vat-summary");
  let schedule = schedules[0];
  if (!inspectOnly) {
    for (const payment of history) {
      const detail = await request("GET", `/payment-schedules/${payment.scheduleId}`);
      checkpoint("Historical schedule supporting records", { scheduleId: detail.id, description: detail.description,
        documents: detail.documents.map(doc => ({ id: doc.id, name: doc.originalName })) });
      if (payment.classification === "unclassified" && payment.classificationVersion === 0) {
        await request("PATCH", `/payment-schedules/${payment.scheduleId}/payments/${payment.id}/classification`, {
          classification: "unclassified", expectedVersion: 0,
          classificationReason: payment.notes?.includes("Historical reconstruction")
            ? "Historical NGN500 dummy schedule reviewed: reconstructed from original Paid event; reconciliation reference is not an original bank reference. Description says controlled test, not a real vendor payment, and no supporting documents exist. Expense/asset/advance/loan purpose is unsupported; retain unclassified and preserve cash history."
            : "Historical NGN1 standalone dummy reconciliation test reviewed: recorded description and notes identify a system test, not expense/asset/advance/loan purpose. No supporting documents exist. Do not guess a financial classification; retain unclassified and preserve cash history.",
        });
      }
    }
    assertUnchangedCash(await snapshot(bank.id), before);
    equalMoney((await request("GET", "/reports/pl?costBasis=actual_paid")).netProfit, plBefore.netProfit);
    schedule = await request("POST", "/payment-schedules", { scheduleDate: new Date(Date.now() + 3600000).toISOString().slice(0,10),
      vendorBeneficiary: label, description: "Six controlled NGN1 dummy payments: consumed stationery expense, equipment asset, recoverable supplier advance, loan principal, other non-expense and unknown purpose. No external transfer.",
      amountRequested: 6, priority: "normal" }, 201);
    checkpoint("Controlled classification schedule created", { scheduleId: schedule.id, branchId: selected.id, amount: 6 });
    await request("PATCH", `/payment-schedules/${schedule.id}/approve`, { comment: "Owner-authorised dummy accounting acceptance only" });
    const classifications = ["operating_expense", "asset", "advance", "loan_repayment", "other_non_expense", "unclassified"];
    const evidence = ["Controlled consumed stationery purchase receipt scenario", "Controlled equipment acquisition invoice scenario", "Controlled recoverable supplier advance agreement scenario", "Controlled loan principal repayment statement scenario; no interest", "Controlled refundable security payment agreement scenario", "Controlled unknown-purpose payment; evidence absent"];
    for (let i=0; i<classifications.length; i++) await request("PATCH", `/payment-schedules/${schedule.id}/pay`, {
      amount: 1, paymentMethod: "bank", bankId: bank.id, reference: `E2E-ACCT45-${classifications[i]}`,
      classification: classifications[i], expenseHead: classifications[i] === "operating_expense" ? "QA stationery" : undefined,
      classificationReason: evidence[i], notes: evidence[i],
    });
    await request("PATCH", `/payment-schedules/${schedule.id}/complete`, { comment: "Six dummy facts retained for audit" });
  } else assert(schedule, "Retained classification schedule missing");
  let detail = await request("GET", `/payment-schedules/${schedule.id}`);
  assert.equal(detail.payments.length, 6); equalMoney(detail.amountPaid, 6);
  const cashAfter = await snapshot(bank.id);
  if (!inspectOnly) {
    equalMoney(cashAfter.bankBalance, before.bankBalance - 6);
    equalMoney(cashAfter.bank.closingBalance, before.bank.closingBalance - 6);
    equalMoney(cashAfter.ledger.summary.net, before.ledger.summary.net - 6);
    equalMoney(cashAfter.cashflow.totals.closingBalance, before.cashflow.totals.closingBalance - 6);
    const expense = detail.payments.find(row => row.classification === "operating_expense");
    assert(expense);
    const path = `/payment-schedules/${schedule.id}/payments/${expense.id}/classification`;
    const changed = await request("PATCH", path, { expectedVersion: expense.classificationVersion, classification: "asset",
      classificationReason: "Controlled correction test: acquisition scenario, no new payment" });
    equalMoney((await request("GET", "/reports/pl?costBasis=actual_paid")).netProfit, plBefore.netProfit);
    await request("PATCH", path, { expectedVersion: changed.classificationVersion, classification: "operating_expense",
      expenseHead: "QA stationery", classificationReason: "Restore controlled consumed stationery receipt scenario after audited classification test" });
    await request("PATCH", path, { expectedVersion: expense.classificationVersion, classification: "advance", classificationReason: "Stale review must not overwrite" }, 409);
    assertUnchangedCash(await snapshot(bank.id), cashAfter);
    detail = await request("GET", `/payment-schedules/${schedule.id}`);
    assert.equal(detail.events.filter(row => row.type === "payment_classified").length, 2);
    const overhead = (await request("GET", "/overhead-expenses")).expenses.find(row => row.category !== "Bad Debt" && row.totalPaid > 0);
    if (overhead) await request("DELETE", `/overhead-expenses/${overhead.id}`, undefined, 409);
  }
  review = await request("GET", "/payment-schedules/accounting-review");
  const own = review.payments.filter(row => row.scheduleId === schedule.id);
  for (const category of ["operating_expense","asset","advance","loan_repayment","other_non_expense","unclassified"]) {
    assert.equal(own.filter(row => row.classification === category).length, 1);
  }
  const pl = await request("GET", "/reports/pl?costBasis=actual_paid");
  const comparison = await request("GET", "/reports/branch-comparison");
  const row = comparison.rows.find(row => row.branchId === selected.id);
  equalMoney(row.netProfit, pl.netProfit); equalMoney(row.overheads, pl.overheads.total);
  const dashboard = await request("GET", "/dashboard/stats");
  equalMoney(dashboard.totalOverheadPaid, pl.overheads.total);
  equalMoney(dashboard.totalNetProfitAfterOverhead, dashboard.totalGrossProfit - pl.overheads.total);
  if (!inspectOnly) { equalMoney(pl.netProfit, plBefore.netProfit - 1); equalMoney(pl.overheads.total, plBefore.overheads.total + 1); }
  const ar = await request("GET", "/invoices/accounts-receivable");
  const aging = await request("GET", "/reports/invoice-aging");
  assert.deepEqual(ar.aging, arBefore.aging);
  for (const [key, amount] of Object.entries(ar.aging)) equalMoney(aging.totals[key], Number(amount));
  equalMoney((await request("GET", "/reports/vat-summary")).totals.totalVat, vatBefore.totals.totalVat);
  checkpoint("ACCT-006 live category/cash/P&L reconciliation", { scheduleId: schedule.id, paymentIds: own.map(row => row.id),
    bankBalance: cashAfter.bankBalance, ledgerNet: cashAfter.ledger.summary.net, cashflowClosing: cashAfter.cashflow.totals.closingBalance,
    revenue: pl.revenue.totalRevenue, paidOverheads: pl.overheads.total, netProfit: pl.netProfit,
    unclassifiedAmount: review.totals.unclassified, unclassifiedCount: review.unclassifiedCount, preservedForAudit: true });
  checkpoint("Operational estimate uses the same paid overhead sources", { paidOverheads: dashboard.totalOverheadPaid,
    budgetedGrossProfit: dashboard.totalGrossProfit, budgetedNetAfterOverhead: dashboard.totalNetProfitAfterOverhead });
  checkpoint("ACCT-007 AR/print five-bucket reconciliation", { aging: ar.aging, grandTotal: aging.totals.grandTotal,
    days61to90: aging.buckets.days61to90.map(row => ({ invoice: row.invoiceNumber, days: row.daysOverdue, outstanding: row.outstanding })),
    days90plus: aging.buckets.days90plus.map(row => ({ invoice: row.invoiceNumber, days: row.daysOverdue, outstanding: row.outstanding })) });
}

try {
  const login = await request("POST", "/auth/login", credential);
  credential.password = undefined;
  if (!staffAccessOnly) assert.equal(login.user?.role ?? login.role, "super_admin", "Owner Super Admin required");
  csrf = (await request("GET", "/auth/csrf")).token;
  if (staffAccessOnly) {
    assert.notEqual(login.user?.role ?? login.role, "super_admin", "Use the existing controlled non-finance staff account");
    await request("GET", "/payment-schedules/accounting-review", undefined, 403);
    await request("GET", "/reports/pl?costBasis=actual_paid", undefined, 403);
    await request("PATCH", "/payment-schedules/1/payments/1/classification", {
      classification: "asset", expectedVersion: 0, classificationReason: "Unauthorised attempt must not post",
    }, 403);
    checkpoint("ACCT-006 separate non-finance staff restrictions", { reviewHTTP: 403, profitReportHTTP: 403, classificationHTTP: 403, noMutation: true });
  } else {
  const ledger = await request("GET", "/reports/financial-ledger");
  const flow = await request("GET", "/reports/cashflow");
  const oldDeposits = ledger.entries.filter(row => row.source === "Client deposit" && Number(row.amount) === 50000000);
  assert.equal(oldDeposits.length, 1, "Existing 50M deposit must appear exactly once");
  equalMoney(ledger.summary.net, flow.totals.closingBalance, "All-time ledger/Cash Flow net mismatch");
  checkpoint("ACCT-001 existing original deposit and all-time reconciliation", { ledger: ledger.summary, cashflow: flow.totals });

  const branches = await request("GET", "/branches");
  const selected = branches.find(row => row.name === "E2E-20260901-Lagos");
  assert(selected, "Use the existing Lagos test branch, not a new branch");
  branch = String(selected.id);
  const banks = await request("GET", "/banks");
  const bank = banks.find(row => row.id === 3 && row.branchId === selected.id && row.isActive);
  assert(bank, "Existing active test bank #3 must match Lagos");
  const clients = await request("GET", "/clients");
  const existing = clients.filter(row => row.name === label);
  assert(existing.length <= 1, "Duplicate acceptance clients already exist");
  if (classificationOnly) {
    await classificationAcceptance(selected, bank);
  } else if (adjustmentsOnly) {
    await adjustmentAcceptance(selected, bank, existing);
  } else if (inspectOnly) {
    assert.equal(existing.length, 1, "Acceptance fixture missing");
    const client = await request("GET", `/clients/${existing[0].id}`);
    const deposits = await request("GET", `/clients/${client.id}/deposits`);
    const invoices = (await request("GET", "/invoices")).filter(row => row.clientId === client.id);
    assert.equal(invoices.length, 1);
    equalMoney(invoices[0].totalPaid, 600); equalMoney(invoices[0].outstanding, 400);
    equalMoney(client.creditBalance, 100);
    assert.equal(deposits.length, 1); equalMoney(deposits[0].allocatedAmount, 0);
    const current = await snapshot(bank.id);
    const future = await request("GET", "/reports/cashflow?from=2099-01-01&to=2099-01-31");
    equalMoney(future.totals.openingBalance, current.cashflow.totals.closingBalance,
      "Non-cash settlements must not inflate future opening balance");
    equalMoney(future.totals.totalIn, 0); equalMoney(future.totals.totalOut, 0);
    equalMoney(current.bankBalance, 1599);
    checkpoint("Live non-cash opening balance and final bank reconciliation", {
      bankBalance: current.bankBalance, openingBalance: future.totals.openingBalance });
    checkpoint("Existing retained acceptance fixture inspection", { clientId: client.id, creditBalance: client.creditBalance,
      deposits, invoices: invoices.map(row => ({ id: row.id, invoiceNumber: row.invoiceNumber, status: row.status,
        totalPaid: row.totalPaid, outstanding: row.outstanding, payments: row.payments })) });
  } else {
    assert.equal(existing.length, 0, "Fixture already exists: stop, inspect it; never repeat live writes automatically");
    const before = await snapshot(bank.id);
    const client = await request("POST", "/clients", { name: label, branchId: selected.id,
      notes: "Dummy accounting acceptance only. No real client, bank transfer, message or document." }, 201);
    checkpoint("New controlled client", { clientId: client.id, branchId: selected.id });
    const container = await request("POST", "/containers", { containerNumber: "ACCT2610081", blNumber: "E2E-ACCT-20261008",
      customerName: label, clientId: client.id, branchId: selected.id, command: "PTML", clearingCharges: 1000,
      declaration: "Dummy accounting acceptance; no operational progression or physical movement." }, 201);
    const draft = await request("POST", "/invoices", { containerIds: [container.id], branchId: selected.id, vatRate: 0,
      dueDate: "2026-10-31", notes: label }, 201);
    await request("PATCH", `/invoices/${draft.id}`, { status: "sent" });
    checkpoint("New controlled invoice/job", { containerId: container.id, invoiceId: draft.id, invoiceNumber: draft.invoiceNumber });
    const deposit = await request("POST", `/clients/${client.id}/deposits`, { amount: 1000, paymentMethod: "Bank Transfer",
      bankId: bank.id, reference: "E2E-ACCT-20261008-DEPOSIT", notes: "Dummy receipt, not an external bank transaction" }, 201);
    const cash = await snapshot(bank.id);
    equalMoney(cash.ledger.summary.net, before.ledger.summary.net + 1000, "Receipt not counted once in ledger");
    equalMoney(cash.cashflow.totals.closingBalance, before.cashflow.totals.closingBalance + 1000, "Receipt not counted once in cash flow");
    equalMoney(cash.bankBalance, before.bankBalance + 1000, "Receipt not counted once in bank");
    assert.equal(cash.ledger.entries.filter(row => row.id === `deposit-${deposit.id}`).length, 1);
    const body = { invoiceId: draft.id, amount: 400, requestKey: "acct-live-20261008-deposit-400" };
    await request("POST", `/client-deposits/${deposit.id}/allocate`, body);
    const retry = await request("POST", `/client-deposits/${deposit.id}/allocate`, body);
    assert.equal(retry.replayed, true);
    await request("POST", `/client-deposits/${deposit.id}/allocate`, { ...body, amount: 401 }, 409);
    let invoice = await request("GET", `/invoices/${draft.id}`);
    equalMoney(invoice.totalPaid, 400); equalMoney(invoice.outstanding, 600);
    const allocation = invoice.payments.find(row => row.paymentMethod === "deposit" && row.entryType === "payment");
    assert(allocation); assert.equal(allocation.sourceDepositId, deposit.id); assert.equal(allocation.bankId, null);
    assertUnchangedCash(await snapshot(bank.id), cash);
    checkpoint("ACCT-002 allocation/retry does not duplicate cash", { depositId: deposit.id, paymentId: allocation.id,
      paid: invoice.totalPaid, outstanding: invoice.outstanding, cashIncrement: 1000 });
    const cn = await request("POST", `/invoices/${draft.id}/credit-note`, { amount: 700,
      reason: "E2E-ACCT-20261008 non-cash note: 600 invoice adjustment + 100 reusable credit" }, 201);
    equalMoney(cn.appliedToInvoice, 600); equalMoney(cn.creditedToClient, 100);
    assertUnchangedCash(await snapshot(bank.id), cash);
    await request("POST", `/invoices/${draft.id}/payments/${allocation.id}/reverse`, {
      reference: "E2E-ACCT-20261008-DEP-REVERSE", reason: "Controlled test: restore original deposit allocation" });
    invoice = await request("GET", `/invoices/${draft.id}`);
    equalMoney(invoice.totalPaid, 600); equalMoney(invoice.outstanding, 400);
    const deposits = await request("GET", `/clients/${client.id}/deposits`);
    const restored = deposits.find(row => row.id === deposit.id);
    equalMoney(restored.allocatedAmount, 0);
    const creditBody = { amount: 50, requestKey: "acct-live-20261008-credit-50" };
    await request("POST", `/invoices/${draft.id}/apply-credit`, creditBody, 201);
    assert.equal((await request("POST", `/invoices/${draft.id}/apply-credit`, creditBody, 201)).replayed, true);
    invoice = await request("GET", `/invoices/${draft.id}`);
    equalMoney(invoice.totalPaid, 650); equalMoney(invoice.outstanding, 350);
    equalMoney((await request("GET", `/clients/${client.id}`)).creditBalance, 50);
    assertUnchangedCash(await snapshot(bank.id), cash);
    const credit = invoice.payments.find(row => row.paymentMethod === "credit" && row.entryType === "payment");
    assert(credit);
    await request("POST", `/invoices/${draft.id}/payments/${credit.id}/reverse`, {
      reference: "E2E-ACCT-20261008-CREDIT-REVERSE", reason: "Controlled test: restore reusable client credit" });
    const finalClient = await request("GET", `/clients/${client.id}`);
    invoice = await request("GET", `/invoices/${draft.id}`);
    equalMoney(finalClient.creditBalance, 100);
    equalMoney(invoice.totalPaid, 600); equalMoney(invoice.outstanding, 400);
    assert.equal(invoice.status, "partial");
    assertUnchangedCash(await snapshot(bank.id), cash);
    checkpoint("ACCT-003 credit note/client credit and reversals are not cash", { clientId: client.id, containerId: container.id,
      invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, depositId: deposit.id, creditNoteId: cn.id,
      depositUnallocated: 1000, clientCredit: 100, paidSettlement: 600, outstanding: 400,
      retainedCashIncrement: 1000, allNewRecordsRetainedForAudit: true });
    // Cross-module settlement remains visible even though it is excluded from cash.
    const ar = await request("GET", "/invoices/accounts-receivable");
    const clientAR = ar.clients.find(row => row.clientId === client.id);
    assert(clientAR, "Controlled client missing from AR");
    equalMoney(clientAR.outstanding, 400);
    checkpoint("AR settlement retained", { outstanding: clientAR.outstanding });
  }
  }
} finally {
  credential.password = undefined;
  if (csrf) await request("POST", "/auth/logout", {});
  cookies.clear();
}
