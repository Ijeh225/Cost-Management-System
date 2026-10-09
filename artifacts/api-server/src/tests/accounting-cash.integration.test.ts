import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../app";
import { db, pool, branchesTable, usersTable, clientsTable, banksTable, invoicesTable, invoicePaymentsTable, clientDepositsTable, expensePaymentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { ensureInvoiceCashSettlementSchema } from "../lib/invoice-payment-reversal-schema";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const branches: number[] = [];
const adminEmail = `acct-${suffix}@example.test`;
const password = "IsolatedAccounting123!";
let agent: ReturnType<typeof request.agent>;
let csrf: string;

beforeAll(async () => {
  expect((await pool.query("SELECT current_database() AS name")).rows[0].name).toBe("cost_management_integration_test");
  const [branch] = await db.insert(branchesTable).values({ name: `ACCT root ${suffix}`, shortCode: "ACCT" }).returning();
  branches.push(branch.id);
  await db.insert(usersTable).values({ branchId: branch.id, name: "Accounting QA", email: adminEmail,
    passwordHash: await bcrypt.hash(password, 10), role: "super_admin", authorityLevel: "super_admin", jobFunction: "general_staff",
    workspaceAccess: "[]", accessProfileMigratedAt: new Date() });
  agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ email: adminEmail, password })).status).toBe(200);
  csrf = (await agent.get("/api/auth/csrf")).body.token;
});

afterAll(async () => {
  if (!branches.length) return;
  // Delete only this run's isolated fixtures, reversals before their originals.
  await pool.query("DELETE FROM invoice_payments WHERE branch_id=ANY($1) AND entry_type='reversal'", [branches]);
  await pool.query("DELETE FROM invoice_payments WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM invoice_audit_log WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM credit_notes WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM workflow_notifications WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM ai_assistant_audit_logs WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM expense_payments WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM payment_schedule_events WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM payment_schedules WHERE branch_id=ANY($1)", [branches]);
  await pool.query("DELETE FROM overhead_expenses WHERE branch_id=ANY($1)", [branches]);
  await db.delete(clientDepositsTable).where(inArray(clientDepositsTable.branchId, branches));
  await db.delete(invoicesTable).where(inArray(invoicesTable.branchId, branches));
  await db.delete(clientsTable).where(inArray(clientsTable.branchId, branches));
  await db.delete(banksTable).where(inArray(banksTable.branchId, branches));
  await db.delete(usersTable).where(inArray(usersTable.branchId, branches));
  await db.delete(branchesTable).where(inArray(branchesTable.id, branches));
});

async function fixture(credit = "0") {
  const [branch] = await db.insert(branchesTable).values({ name: `ACCT case ${suffix}-${branches.length}`, shortCode: "ACCT" }).returning();
  branches.push(branch.id);
  const [client] = await db.insert(clientsTable).values({ branchId: branch.id, name: `ACCT client ${suffix}`, creditBalance: credit }).returning();
  const [bank] = await db.insert(banksTable).values({ branchId: branch.id, name: `ACCT bank ${suffix}` }).returning();
  const [invoice] = await db.insert(invoicesTable).values({ branchId: branch.id, clientId: client.id,
    invoiceNumber: `ACCT-${suffix}-${branch.id}`, status: "sent", subtotal: "1000", total: "1000" }).returning();
  return { branch, client, bank, invoice };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(f: Fixture, path: string, body: object) {
  return agent.post(`/api${path}`).set("X-Branch-Id", String(f.branch.id)).set("X-CSRF-Token", csrf).send(body);
}
function get(f: Fixture, path: string) { return agent.get(`/api${path}`).set("X-Branch-Id", String(f.branch.id)); }
async function deposit(f: Fixture, amount = 1000) {
  const response = await post(f, `/clients/${f.client.id}/deposits`, { amount, paymentMethod: "Bank Transfer", bankId: f.bank.id, reference: `ACCT-${f.branch.id}` });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id as number;
}
async function assertCash(f: Fixture, amount: number) {
  const ledger = await get(f, "/reports/financial-ledger");
  const cashflow = await get(f, "/reports/cashflow");
  const bank = await get(f, `/banks/${f.bank.id}/transactions`);
  const banks = await get(f, "/banks");
  for (const result of [ledger, cashflow, bank, banks]) expect(result.status).toBe(200);
  expect(ledger.body.summary.net, "Financial Ledger cash").toBe(amount);
  expect(cashflow.body.totals.closingBalance, "Cash Flow cash").toBe(amount);
  expect(bank.body.closingBalance, "Bank statement cash").toBe(amount);
  expect(banks.body.find((row: { id: number }) => row.id === f.bank.id).currentBalance, "Bank list cash").toBe(amount);
}

describe("accounting cash source regressions", () => {
  it("ACCT-004 reconciles proportional credit-note net and VAT in P&L and VAT Summary", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ vatAmount: "75", total: "1075" }).where(eq(invoicesTable.id, f.invoice.id));
    const cn = await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 107.5, reason: "Isolated VAT adjustment" });
    expect(cn.status, JSON.stringify(cn.body)).toBe(201);
    const pl = await get(f, "/reports/pl?costBasis=actual_paid");
    const vat = await get(f, "/reports/vat-summary");
    expect(pl.status).toBe(200);
    expect(vat.status).toBe(200);
    expect(pl.body.revenue.totalRevenue).toBe(900);
    expect(pl.body.revenue.totalVatCollected).toBe(67.5);
    expect(vat.body.totals.totalSubtotal).toBe(900);
    expect(vat.body.totals.totalVat).toBe(67.5);
    expect((await get(f, `/invoices/${f.invoice.id}`)).body.outstanding).toBe(967.5);
    await assertCash(f, 0);
  });

  it("ACCT-005 recognises outstanding bad debt once without a cash expense", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ dueDate: "2020-01-01", vatAmount: "75", total: "1075" }).where(eq(invoicesTable.id, f.invoice.id));
    const [payment] = await db.insert(invoicePaymentsTable).values({ invoiceId: f.invoice.id, branchId: f.branch.id, bankId: f.bank.id, amount: "300" }).returning();
    const result = await post(f, `/invoices/${f.invoice.id}/write-off`, {});
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.writtenOffAmount).toBe(775);
    const pl = await get(f, "/reports/pl?costBasis=actual_paid");
    expect(pl.status).toBe(200);
    expect(pl.body.revenue.totalRevenue).toBe(1000);
    expect(pl.body.adjustments.totalBadDebts, JSON.stringify(pl.body.adjustments)).toBe(775);
    expect(pl.body.netProfit).toBe(225);
    expect((await get(f, "/reports/vat-summary")).body.totals.totalVat).toBe(75);
    const comparison = await get(f, "/reports/branch-comparison");
    const branch = comparison.body.rows.find((row: { branchId: number }) => row.branchId === f.branch.id);
    expect(branch.netProfit).toBe(225);
    expect(branch.outstandingReceivables).toBe(0);
    expect((await get(f, `/invoices/${f.invoice.id}`)).body.outstanding).toBe(0);
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-FROZEN", reason: "Cannot alter frozen loss" })).status).toBe(409);
    expect((await post(f, `/invoices/${f.invoice.id}/write-off`, {})).status).toBe(400);
    expect((await pool.query("SELECT count(*)::int AS n FROM expense_payments WHERE branch_id=$1", [f.branch.id])).rows[0].n).toBe(0);
    await assertCash(f, 300);
  });

  it("ACCT-005 refuses due-today and fully settled write-offs without creating evidence", async () => {
    const f = await fixture();
    const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    await db.update(invoicesTable).set({ dueDate: today }).where(eq(invoicesTable.id, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/write-off`, {})).status).toBe(400);
    await db.update(invoicesTable).set({ dueDate: "2020-01-01" }).where(eq(invoicesTable.id, f.invoice.id));
    await db.insert(invoicePaymentsTable).values({ invoiceId: f.invoice.id, branchId: f.branch.id, amount: "1000", paymentMethod: "credit_note" });
    expect((await post(f, `/invoices/${f.invoice.id}/write-off`, {})).status).toBe(400);
    expect((await pool.query("SELECT count(*)::int AS n FROM overhead_expenses WHERE branch_id=$1", [f.branch.id])).rows[0].n).toBe(0);
    expect((await get(f, "/reports/pl")).body.adjustments.totalBadDebts).toBe(0);
    await assertCash(f, 0);
  });

  it("ACCT-005 flags legacy cash postings without deducting the bad debt twice", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ dueDate: "2020-01-01" }).where(eq(invoicesTable.id, f.invoice.id));
    const result = await post(f, `/invoices/${f.invoice.id}/write-off`, {});
    expect(result.status).toBe(201);
    // Simulate old data only inside this run's isolated branch; new API writes refuse this.
    const [payment] = await db.insert(expensePaymentsTable).values({ expenseId: result.body.overheadExpenseId,
      branchId: f.branch.id, bankId: f.bank.id, amount: "100", paymentMethod: "bank" }).returning();
    const pl = await get(f, "/reports/pl?costBasis=actual_paid");
    expect(pl.status).toBe(200);
    expect(pl.body.overheads.total).toBe(0);
    expect(pl.body.adjustments.totalBadDebts).toBe(1000);
    expect(pl.body.netProfit).toBe(0);
    expect(pl.body.adjustments.legacyBadDebtPayments).toEqual([{ paymentId: payment.id, amount: 100 }]);
    const comparison = await get(f, "/reports/branch-comparison");
    const branch = comparison.body.rows.find((row: { branchId: number }) => row.branchId === f.branch.id);
    expect(branch.overheads).toBe(0);
    expect(branch.badDebts).toBe(1000);
    expect(branch.netProfit).toBe(0);
    expect(comparison.body.legacyBadDebtPayments).toContainEqual({ paymentId: payment.id, amount: 100 });
    await assertCash(f, -100);
  });

  it("ACCT-004 rejects cumulative notes beyond the invoice face value", async () => {
    const f = await fixture();
    expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 700, reason: "First adjustment" })).status).toBe(201);
    expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 700, reason: "Excess adjustment" })).status).toBe(400);
  });

  it("ACCT-004 dates credit notes independently of their original invoice period", async () => {
    const f = await fixture();
    const now = new Date();
    const quarterStart = new Date(Date.UTC(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    const oldDate = new Date(quarterStart.getTime() - 12 * 3600000);
    await db.update(invoicesTable).set({ createdAt: oldDate, vatAmount: "75", total: "1075" }).where(eq(invoicesTable.id, f.invoice.id));
    const note = await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 107.5, reason: "Later-period adjustment" });
    expect(note.status).toBe(201);
    const from = `${now.getFullYear()}-${String(quarterStart.getMonth() + 1).padStart(2, "0")}-01`;
    const pl = await get(f, `/reports/pl?from=${from}&costBasis=actual_paid`);
    const vat = await get(f, `/reports/vat-summary?from=${from}`);
    const liability = await get(f, "/reports/vat-liability");
    expect(pl.body.revenue.totalRevenue).toBe(-100);
    expect(vat.body.totals.totalVat).toBe(-7.5);
    expect(liability.body.currentQuarter.vatCollected).toBe(-7.5);
    expect(liability.body.currentQuarter.taxableAmount).toBe(-100);
    const before = oldDate.toISOString().slice(0, 10);
    expect((await get(f, `/reports/pl?to=${before}`)).body.revenue.totalRevenue).toBe(1000);
    expect((await get(f, `/reports/vat-summary?to=${before}`)).body.totals.totalVat).toBe(75);
    const comparison = await get(f, `/reports/branch-comparison?from=${from}`);
    expect(comparison.body.rows.find((row: { branchId: number }) => row.branchId === f.branch.id).revenue).toBe(-100);
    expect((await get(f, `/reports/pl?clientId=${f.client.id}&from=${from}`)).body.revenue.totalRevenue).toBe(-100);
  });

  it("ACCT-004 serializes simultaneous notes against the remaining invoice value", async () => {
    const f = await fixture();
    const results = await Promise.all([1, 2].map(n => post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 700, reason: `Concurrent adjustment ${n}` })));
    expect(results.map(row => row.status).sort()).toEqual([201, 400]);
    expect((await get(f, "/reports/pl")).body.revenue.totalRevenue).toBe(300);
  });

  it("ACCT-004 reconciles Lagos midnight across report periods and months", async () => {
    const f = await fixture();
    const now = new Date();
    const month = Math.floor(now.getUTCMonth() / 3) * 3 + 1;
    const day = `${now.getUTCFullYear()}-${String(month).padStart(2, "0")}-01`;
    const date = new Date(`${day}T00:15:00+01:00`);
    await db.update(invoicesTable).set({ createdAt: date, vatAmount: "75", total: "1075" }).where(eq(invoicesTable.id, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 107.5, reason: "Midnight accounting date" })).status).toBe(201);
    await pool.query("UPDATE credit_notes SET created_at=$1 WHERE invoice_id=$2", [date, f.invoice.id]);
    const pl = await get(f, `/reports/pl?from=${day}&to=${day}`);
    const vat = await get(f, `/reports/vat-summary?from=${day}&to=${day}`);
    expect(pl.body.revenue.totalRevenue).toBe(900);
    expect(pl.body.monthly.map((row: { month: string }) => row.month)).toEqual([day.slice(0, 7)]);
    expect(vat.body.totals.totalVat).toBe(67.5);
    expect((await get(f, "/reports/vat-liability")).body.currentQuarter.vatCollected).toBe(67.5);
    const comparison = await get(f, `/reports/branch-comparison?from=${day}&to=${day}`);
    expect(comparison.body.rows.find((row: { branchId: number }) => row.branchId === f.branch.id).revenue).toBe(900);
  });

  it("ACCT-004 full notes on paid invoices create reusable credit without cash or duplicate VAT", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ vatAmount: "75", total: "1075", status: "paid" }).where(eq(invoicesTable.id, f.invoice.id));
    await db.insert(invoicePaymentsTable).values({ invoiceId: f.invoice.id, branchId: f.branch.id, bankId: f.bank.id, amount: "1075" });
    for (const amount of [358.33, 358.33, 358.34]) {
      expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount, reason: "Paid invoice adjustment" })).status).toBe(201);
    }
    const pl = await get(f, "/reports/pl");
    expect(pl.body.revenue.totalRevenue).toBe(0);
    expect(pl.body.revenue.totalVatCollected).toBe(0);
    expect((await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id)))[0].creditBalance).toBe("1075.00");
    await assertCash(f, 1075);
  });

  it("ACCT-005 serializes write-offs and protects non-cash evidence from payment and editing", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ dueDate: "2020-01-01" }).where(eq(invoicesTable.id, f.invoice.id));
    const results = await Promise.all([post(f, `/invoices/${f.invoice.id}/write-off`, {}), post(f, `/invoices/${f.invoice.id}/write-off`, {})]);
    expect(results.map(row => row.status).sort()).toEqual([201, 400]);
    const expenseId = results.find(row => row.status === 201)!.body.overheadExpenseId;
    const legacySchedule = (await pool.query("INSERT INTO payment_schedules(branch_id,schedule_date,overhead_expense_id,vendor_beneficiary,description,amount_requested,amount_approved,status) VALUES ($1,now(),$2,'ACCT bad debt','Invalid legacy payable',100,100,'approved') RETURNING id", [f.branch.id, expenseId])).rows[0].id;
    expect((await agent.patch(`/api/payment-schedules/${legacySchedule}/pay`).set("X-Branch-Id", String(f.branch.id)).set("X-CSRF-Token", csrf).send({ amount: 100, paymentMethod: "bank", bankId: f.bank.id })).status).toBe(400);
    expect((await post(f, `/overhead-expenses/${expenseId}/payments`, { amount: 100, paymentMethod: "bank", bankId: f.bank.id })).status).toBe(409);
    expect((await post(f, `/overhead-expenses/${expenseId}/payment-schedules`, { amountRequested: 100 })).status).toBe(409);
    expect((await post(f, `/overhead-expenses/${expenseId}/topups`, { amount: 100, description: "Invalid topup" })).status).toBe(409);
    expect((await agent.patch(`/api/overhead-expenses/${expenseId}`).set("X-Branch-Id", String(f.branch.id)).set("X-CSRF-Token", csrf).send({ category: "Other" })).status).toBe(409);
    expect((await agent.delete(`/api/overhead-expenses/${expenseId}`).set("X-Branch-Id", String(f.branch.id)).set("X-CSRF-Token", csrf)).status).toBe(409);
    const overheads = await get(f, "/overhead-expenses");
    expect(overheads.body.expenses.find((row: { id: number }) => row.id === expenseId).status).toBe("non_cash");
    expect(overheads.body.totalOutstanding).toBe(0);
    expect((await get(f, "/reports/pl")).body.adjustments.totalBadDebts).toBe(1000);
    await assertCash(f, 0);
  });

  it("ACCT-004/005 enforce active branch, status, input and non-finance access", async () => {
    const f = await fixture();
    const other = await fixture();
    expect((await post(other, `/invoices/${f.invoice.id}/credit-note`, { amount: 10, reason: "Wrong active branch" })).status).toBe(404);
    expect((await post(other, `/invoices/${f.invoice.id}/write-off`, {})).status).toBe(404);
    for (const amount of [0, -1, 0.001, "1junk", null]) {
      expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount, reason: "Invalid money" })).status).toBe(400);
    }
    for (const status of ["draft", "cancelled", "written_off"]) {
      await db.update(invoicesTable).set({ status }).where(eq(invoicesTable.id, f.invoice.id));
      expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 10, reason: "Invalid lifecycle" })).status).toBe(400);
    }
    await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, f.invoice.id));
    const email = `acct-staff-${suffix}@example.test`;
    await db.insert(usersTable).values({ branchId: f.branch.id, name: "Non-finance adjustment QA", email,
      passwordHash: await bcrypt.hash(password, 10), role: "staff", authorityLevel: "staff", jobFunction: "operations",
      workspaceAccess: '["transire"]', accessProfileMigratedAt: new Date() });
    const staff = request.agent(app);
    expect((await staff.post("/api/auth/login").send({ email, password })).status).toBe(200);
    const token = (await staff.get("/api/auth/csrf")).body.token;
    for (const path of ["credit-note", "write-off"]) {
      expect((await staff.post(`/api/invoices/${f.invoice.id}/${path}`).set("X-CSRF-Token", token).send({ amount: 10, reason: "Must not post" })).status).toBe(403);
    }
  });

  it("ACCT-005 recognises loss in its audited period and flags undated legacy write-offs", async () => {
    const f = await fixture();
    await db.update(invoicesTable).set({ createdAt: new Date("2020-01-01"), dueDate: "2020-01-02" }).where(eq(invoicesTable.id, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/write-off`, {})).status).toBe(201);
    const from = new Date().toISOString().slice(0, 10);
    const pl = await get(f, `/reports/pl?from=${from}`);
    expect(pl.body.revenue.totalRevenue).toBe(0);
    expect(pl.body.adjustments.totalBadDebts).toBe(1000);
    expect(pl.body.netProfit).toBe(-1000);
    expect(pl.body.monthly[0].badDebts).toBe(1000);
    expect((await get(f, `/reports/pl?to=2020-12-31`)).body.netProfit).toBe(1000);
    await pool.query("DELETE FROM invoice_audit_log WHERE invoice_id=$1 AND action='written_off'", [f.invoice.id]);
    const legacy = await get(f, "/reports/pl");
    expect(legacy.body.adjustments.undatedBadDebts).toEqual([f.invoice.id]);
    expect(legacy.body.adjustments.totalBadDebts).toBe(0);
  });

  it("upgrades the existing reversal schema without replacing rows and is repeatable", async () => {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("CREATE TEMP TABLE client_deposits (id integer PRIMARY KEY) ON COMMIT DROP");
      await connection.query("CREATE TEMP TABLE invoice_payments (id integer PRIMARY KEY, amount numeric(15,2), entry_type text) ON COMMIT DROP");
      await connection.query("INSERT INTO invoice_payments VALUES (1,100,'payment')");
      await ensureInvoiceCashSettlementSchema(connection);
      await ensureInvoiceCashSettlementSchema(connection);
      const result = await connection.query("SELECT id,amount,entry_type,source_deposit_id,settlement_request_key,settlement_request_amount FROM invoice_payments");
      expect(result.rows).toEqual([{ id: 1, amount: "100.00", entry_type: "payment", source_deposit_id: null, settlement_request_key: null, settlement_request_amount: null }]);
      await connection.query("INSERT INTO invoice_payments(id,amount,entry_type,settlement_request_key) VALUES (2,50,'payment','same-test-key')");
      await expect(connection.query("INSERT INTO invoice_payments(id,amount,entry_type,settlement_request_key) VALUES (3,50,'payment','same-test-key')")).rejects.toMatchObject({ code: "23505" });
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });

  it("ACCT-001 includes an original deposit once in branch and date scoped Financial Ledger", async () => {
    const f = await fixture();
    const id = await deposit(f);
    const report = await get(f, "/reports/financial-ledger");
    expect(report.status).toBe(200);
    expect(report.body.entries.filter((row: { id: string }) => row.id === `deposit-${id}`)).toHaveLength(1);
    await assertCash(f, 1000);
    expect((await get(f, "/reports/financial-ledger?from=2099-01-01")).body.summary.net).toBe(0);
  });

  it("ACCT-002 allocating 400 settles the invoice without receiving another 400", async () => {
    const f = await fixture();
    const id = await deposit(f);
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 400 })).status).toBe(200);
    const [row] = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, id));
    expect(Number(row.amount) - Number(row.allocatedAmount)).toBe(600);
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    expect(Number(payment.amount)).toBe(400);
    await assertCash(f, 1000);
    expect(payment.paymentMethod).toBe("deposit");
    expect(payment.bankId).toBeNull();
    expect(payment.sourceDepositId).toBe(id);
    const invoice = await get(f, `/invoices/${f.invoice.id}`);
    expect(invoice.body.totalPaid).toBe(400);
    expect(invoice.body.outstanding).toBe(600);
    expect(invoice.body.status).toBe("partial");
  });

  it("ACCT-003 applying client credit changes settlement but not cash or cash opening", async () => {
    const f = await fixture("200");
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 100 })).status).toBe(201);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id));
    expect(Number(client.creditBalance)).toBe(100);
    await assertCash(f, 0);
    const future = await get(f, "/reports/cashflow?from=2099-01-01&to=2099-01-31");
    expect(future.body.totals.openingBalance).toBe(0);
  });

  it("ACCT-003 a credit-note settlement is not a cash receipt", async () => {
    const f = await fixture();
    const cn = await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 100, reason: "Isolated non-cash note" });
    expect(cn.status, JSON.stringify(cn.body)).toBe(201);
    const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    expect(payments.map(row => row.paymentMethod)).toEqual(["credit_note"]);
    await assertCash(f, 0);
  });

  it("serializes simultaneous deposit allocations to different invoices", async () => {
    const f = await fixture();
    const id = await deposit(f);
    const [other] = await db.insert(invoicesTable).values({ branchId: f.branch.id, clientId: f.client.id,
      invoiceNumber: `ACCT-other-${suffix}-${f.branch.id}`, status: "sent", total: "1000" }).returning();
    const results = await Promise.all([f.invoice.id, other.id].map(invoiceId => post(f, `/client-deposits/${id}/allocate`, { invoiceId, amount: 600 })));
    expect(results.map(row => row.status).sort()).toEqual([200, 400]);
    const [row] = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, id));
    expect(Number(row.allocatedAmount)).toBe(600);
    await assertCash(f, 1000);
  });

  it("serializes simultaneous client-credit consumption across invoices", async () => {
    const f = await fixture("100");
    const [other] = await db.insert(invoicesTable).values({ branchId: f.branch.id, clientId: f.client.id,
      invoiceNumber: `ACCT-credit-${suffix}-${f.branch.id}`, status: "sent", total: "1000" }).returning();
    const results = await Promise.all([f.invoice.id, other.id].map(id => post(f, `/invoices/${id}/apply-credit`, { amount: 80 })));
    expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results.reduce((sum, row) => sum + row.body.appliedAmount, 0)).toBe(100);
    await assertCash(f, 0);
  });

  it("reverses a deposit application into available deposit, not bank cash", async () => {
    const f = await fixture();
    const id = await deposit(f);
    await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 400 });
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    const result = await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-REVERSE", reason: "Undo isolated allocation" });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(Number((await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, id)))[0].allocatedAmount)).toBe(0);
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 400 })).status).toBe(200);
    await assertCash(f, 1000);
  });

  it("reverses credit application into client credit without inventing cash", async () => {
    const f = await fixture("100");
    await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 80 });
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-CREDIT-REVERSE", reason: "Undo isolated credit" })).status).toBe(200);
    expect(Number((await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id)))[0].creditBalance)).toBe(100);
    await assertCash(f, 0);
  });

  it("replays simultaneous identical deposit requests once and rejects changed reuse", async () => {
    const f = await fixture();
    const id = await deposit(f);
    const body = { invoiceId: f.invoice.id, amount: 400, requestKey: `deposit-${suffix}` };
    const results = await Promise.all([post(f, `/client-deposits/${id}/allocate`, body), post(f, `/client-deposits/${id}/allocate`, body)]);
    expect(results.map(row => row.status)).toEqual([200, 200]);
    expect(results.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id))).toHaveLength(1);
    expect((await post(f, `/client-deposits/${id}/allocate`, { ...body, amount: 300 })).status).toBe(409);
    expect(Number((await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, id)))[0].allocatedAmount)).toBe(400);
    await assertCash(f, 1000);
  });

  it("replays exhausted client-credit requests without consuming credit twice", async () => {
    const f = await fixture("100");
    const body = { amount: 100, requestKey: `credit-${suffix}` };
    const results = await Promise.all([post(f, `/invoices/${f.invoice.id}/apply-credit`, body), post(f, `/invoices/${f.invoice.id}/apply-credit`, body)]);
    expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(results.map(row => row.body.appliedAmount)).toEqual([100, 100]);
    expect(await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id))).toHaveLength(1);
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { ...body, amount: 50 })).status).toBe(409);
    await assertCash(f, 0);
  });

  it("keeps actual bank receipts and their reversals in cash reports", async () => {
    const f = await fixture();
    const receipt = await post(f, `/invoices/${f.invoice.id}/payments`, { amount: 400, paymentMethod: "transfer", bankId: f.bank.id, reference: `ACCT-real-${f.branch.id}` });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    await assertCash(f, 400);
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-CASH-REVERSE", reason: "Undo isolated cash" })).status).toBe(200);
    await assertCash(f, 0);
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-CASH-REPEAT", reason: "Cannot reverse twice" })).status).toBe(409);
  });

  it("keeps a historical deposit in opening cash without adding its later application", async () => {
    const f = await fixture();
    const id = await deposit(f);
    await db.update(clientDepositsTable).set({ createdAt: new Date("2000-01-01T12:00:00Z") }).where(eq(clientDepositsTable.id, id));
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 400 })).status).toBe(200);
    const flow = await get(f, "/reports/cashflow?from=2020-01-01&to=2099-01-31");
    expect(flow.status).toBe(200);
    expect(flow.body.totals.openingBalance).toBe(1000);
    expect(flow.body.totals.closingBalance).toBe(1000);
    expect((await get(f, "/reports/financial-ledger?from=2020-01-01")).body.summary.net).toBe(0);
  });

  it("rejects a different client, wrong branch, draft invoice and invalid monetary input", async () => {
    const f = await fixture("100");
    const other = await fixture();
    const id = await deposit(f);
    expect((await post(other, `/client-deposits/${id}/allocate`, { invoiceId: other.invoice.id, amount: 10 })).status).toBe(404);
    const [client] = await db.insert(clientsTable).values({ branchId: f.branch.id, name: `Other client ${suffix}` }).returning();
    const [invoice] = await db.insert(invoicesTable).values({ branchId: f.branch.id, clientId: client.id, invoiceNumber: `ACCT-mismatch-${suffix}`, status: "sent", total: "1000" }).returning();
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: invoice.id, amount: 10 })).status).toBe(400);
    await db.update(invoicesTable).set({ status: "draft" }).where(eq(invoicesTable.id, f.invoice.id));
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 10 })).status).toBe(400);
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 10 })).status).toBe(400);
    for (const amount of [0, -1, 0.001, "10junk"]) {
      expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount })).status).toBe(400);
      expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount })).status).toBe(400);
    }
    expect(await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id))).toHaveLength(0);
    await assertCash(f, 1000);
  });

  it("retains reversed deposit history and refuses generic reversal of credit notes", async () => {
    const f = await fixture();
    const id = await deposit(f);
    await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 100 });
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${payment.id}/reverse`, { reference: "ACCT-HISTORY", reason: "History must remain" })).status).toBe(200);
    expect((await agent.delete(`/api/clients/${f.client.id}/deposits/${id}`).set("X-Branch-Id", String(f.branch.id)).set("X-CSRF-Token", csrf)).status).toBe(409);
    expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 100, reason: "Not a cash payment" })).status).toBe(201);
    const rows = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id));
    const adjustment = rows.find(row => row.paymentMethod === "credit_note")!;
    expect((await post(f, `/invoices/${f.invoice.id}/payments/${adjustment.id}/reverse`, { reference: "ACCT-NOT-CASH", reason: "Invalid payment reversal" })).status).toBe(409);
    await assertCash(f, 1000);
  });

  it("keeps legacy non-cash bank links outside cash totals", async () => {
    const f = await fixture();
    const id = await deposit(f);
    await db.insert(invoicePaymentsTable).values([
      { branchId: f.branch.id, invoiceId: f.invoice.id, amount: "100", paymentMethod: "credit", bankId: f.bank.id },
      { branchId: f.branch.id, invoiceId: f.invoice.id, amount: "100", paymentMethod: "credit_note", bankId: f.bank.id },
      { branchId: f.branch.id, invoiceId: f.invoice.id, amount: "200", paymentMethod: "transfer", bankId: f.bank.id, sourceDepositId: id },
    ]);
    await assertCash(f, 1000);
  });

  it("refuses extra settlement against a fully settled invoice and preserves available credit", async () => {
    const f = await fixture("1000");
    const id = await deposit(f);
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 1000 })).status).toBe(200);
    const invoice = await get(f, `/invoices/${f.invoice.id}`);
    expect(invoice.body.status).toBe("paid");
    expect(invoice.body.outstanding).toBe(0);
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 1 })).status).toBe(400);
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 1 })).status).toBe(400);
    expect(Number((await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id)))[0].creditBalance)).toBe(1000);
    await assertCash(f, 1000);
  });

  it("preserves finance access restrictions for a separate non-finance staff session", async () => {
    const f = await fixture("100");
    const id = await deposit(f);
    const email = `acct-staff-${suffix}@example.test`;
    await db.insert(usersTable).values({ branchId: f.branch.id, name: "Isolated delivery staff", email,
      passwordHash: await bcrypt.hash(password, 10), role: "staff", authorityLevel: "staff", jobFunction: "delivery",
      workspaceAccess: '["delivery"]', accessProfileMigratedAt: new Date() });
    const staff = request.agent(app);
    expect((await staff.post("/api/auth/login").send({ email, password })).status).toBe(200);
    const token = (await staff.get("/api/auth/csrf")).body.token;
    for (const [path, body] of [
      [`/clients/${f.client.id}/deposits`, { amount: 10, paymentMethod: "Cash" }],
      [`/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 10 }],
      [`/invoices/${f.invoice.id}/apply-credit`, { amount: 10 }],
      [`/invoices/${f.invoice.id}/payments/1/reverse`, { reference: "Denied", reason: "Must be forbidden" }],
    ] as const) {
      expect((await staff.post(`/api${path}`).set("X-CSRF-Token", token).send(body)).status).toBe(403);
    }
    expect(await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, f.invoice.id))).toHaveLength(0);
    expect(Number((await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id)))[0].creditBalance)).toBe(100);
  });

  it("uses the same cash population in AI cash tools without changing receivables", async () => {
    const f = await fixture("100");
    const id = await deposit(f);
    expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount: 300 })).status).toBe(200);
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 100 })).status).toBe(201);
    expect((await post(f, `/invoices/${f.invoice.id}/credit-note`, { amount: 100, reason: "Non-cash AI regression" })).status).toBe(201);
    expect((await post(f, `/invoices/${f.invoice.id}/payments`, { amount: 50, paymentMethod: "transfer", bankId: f.bank.id, reference: `ACCT-AI-${f.branch.id}` })).status).toBe(201);
    const summary = await post(f, "/ai-assistant/tools/payment_summary", {});
    const monthly = await post(f, "/ai-assistant/tools/monthly_financial_report", {});
    const bank = await post(f, "/ai-assistant/tools/bank_ledger_reconciliation", {});
    for (const response of [summary, monthly, bank]) expect(response.status, JSON.stringify(response.body)).toBe(200);
    function amount(response: typeof summary, label: string) {
      return Number(String(response.body.facts.find((fact: { label: string }) => fact.label === label)?.value).replace(/[^\d.-]/g, ""));
    }
    expect(amount(summary, "Invoice collections")).toBe(50);
    expect(amount(summary, "Client deposits")).toBe(1000);
    expect(amount(monthly, "Net recorded cash movement")).toBe(1050);
    expect(amount(bank, "Ledger balance")).toBe(1050);
    const invoice = await get(f, `/invoices/${f.invoice.id}`);
    expect(invoice.body.totalPaid).toBe(550);
    expect(invoice.body.outstanding).toBe(450);
    await assertCash(f, 1050);
  });

  it("retains exact stored fractional balances and rejects missing settlement inputs", async () => {
    const f = await fixture("0.30");
    const id = await deposit(f, 0.30);
    expect((await post(f, `/client-deposits/${id}/allocate`, {})).status).toBe(400);
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, {})).status).toBe(400);
    for (const amount of [0.10, 0.20]) {
      expect((await post(f, `/client-deposits/${id}/allocate`, { invoiceId: f.invoice.id, amount })).status).toBe(200);
    }
    const [stored] = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, id));
    expect(stored.allocatedAmount).toBe("0.30");
    expect((await post(f, `/invoices/${f.invoice.id}/apply-credit`, { amount: 0.10 })).status).toBe(201);
    expect((await db.select().from(clientsTable).where(eq(clientsTable.id, f.client.id)))[0].creditBalance).toBe("0.20");
    await assertCash(f, 0.30);
  });
});
