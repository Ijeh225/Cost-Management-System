// One bounded live dummy-data acceptance; secrets/cookies stay in memory.
import assert from "node:assert/strict";

assert(process.argv.includes("--confirm=LIVE-ACCT-STEPS12-20261008"), "Explicit live test confirmation required");
const inspectOnly = process.argv.includes("--inspect-only");
const base = "https://donclimaxmanagementapp.com/api";
const label = "E2E-ACCT-20261008 Cash Settlement QA";
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

try {
  const login = await request("POST", "/auth/login", credential);
  credential.password = undefined;
  assert.equal(login.user?.role ?? login.role, "super_admin", "Owner Super Admin required");
  csrf = (await request("GET", "/auth/csrf")).token;
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
  if (inspectOnly) {
    assert.equal(existing.length, 1, "Acceptance fixture missing");
    const client = await request("GET", `/clients/${existing[0].id}`);
    const deposits = await request("GET", `/clients/${client.id}/deposits`);
    const invoices = (await request("GET", "/invoices")).filter(row => row.clientId === client.id);
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
} finally {
  credential.password = undefined;
  if (csrf) await request("POST", "/auth/logout", {});
  cookies.clear();
}
