import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../app";
import {
  db,
  banksTable,
  bankFundAdditionsTable,
  bankTransfersTable,
  branchesTable,
  containersTable,
  clientsTable,
  expensePaymentsTable,
  invoiceAuditLogTable,
  invoicePaymentsTable,
  invoicesTable,
  overheadExpensesTable,
  paymentSchedulePaymentsTable,
  paymentSchedulesTable,
  shippingChargesTable,
  usersTable,
  workflowNotificationsTable,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";

type Session = { agent: ReturnType<typeof request.agent>; csrf: string };

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const password = "IntegrationPass123!";
let branchAId = 0;
let branchBId = 0;
let adminId = 0;
let branchAdminId = 0;
let officerId = 0;
let otherBranchUserId = 0;
let admin: Session;
let branchAdmin: Session;
let officer: Session;
let otherBranchUser: Session;
let protectedContainerId = 0;
let paymentExpenseId = 0;
let paymentScheduleId = 0;
let standaloneScheduleId = 0;
let collectionBankId = 0;
let transferBankId = 0;
let collectionInvoiceId = 0;
let collectionClientId = 0;
let createdStaffUserId = 0;

async function login(email: string): Promise<Session> {
  const agent = request.agent(app);
  const result = await agent.post("/api/auth/login").send({ email, password });
  if (result.status !== 200) throw new Error(`Test login failed: ${result.status} ${JSON.stringify(result.body)}`);
  const csrf = await agent.get("/api/auth/csrf");
  if (csrf.status !== 200 || typeof csrf.body.token !== "string") throw new Error("Unable to obtain CSRF token for test session");
  return { agent, csrf: csrf.body.token };
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const [branchA, branchB] = await db.insert(branchesTable).values([
    { name: `Integration A ${suffix}`, shortCode: "ITA" },
    { name: `Integration B ${suffix}`, shortCode: "ITB" },
  ]).returning({ id: branchesTable.id });
  branchAId = branchA.id;
  branchBId = branchB.id;

  const [adminUser, branchAdminUser, officerUser, otherUser] = await db.insert(usersTable).values([
    {
      name: "Integration Admin",
      email: `integration-admin-${suffix}@example.test`,
      passwordHash,
      role: "admin",
      authorityLevel: "admin",
      jobFunction: "general_staff",
      workspaceAccess: JSON.stringify([]),
      accessProfileMigratedAt: new Date(),
      branchId: branchAId,
    },
    {
      name: "Integration Branch Admin",
      email: `integration-branch-admin-${suffix}@example.test`,
      passwordHash,
      role: "branch_admin",
      authorityLevel: "branch_admin",
      jobFunction: "general_staff",
      workspaceAccess: JSON.stringify([]),
      accessProfileMigratedAt: new Date(),
      branchId: branchAId,
    },
    {
      name: "Integration Officer",
      email: `integration-officer-${suffix}@example.test`,
      passwordHash,
      role: "staff",
      authorityLevel: "staff",
      jobFunction: "general_staff",
      workspaceAccess: JSON.stringify([]),
      accessProfileMigratedAt: new Date(),
      branchId: branchAId,
    },
    {
      name: "Integration Other Branch",
      email: `integration-other-${suffix}@example.test`,
      passwordHash,
      role: "staff",
      authorityLevel: "staff",
      jobFunction: "general_staff",
      workspaceAccess: JSON.stringify([]),
      accessProfileMigratedAt: new Date(),
      branchId: branchBId,
    },
  ]).returning({ id: usersTable.id });
  adminId = adminUser.id;
  branchAdminId = branchAdminUser.id;
  officerId = officerUser.id;
  otherBranchUserId = otherUser.id;

  admin = await login(`integration-admin-${suffix}@example.test`);
  branchAdmin = await login(`integration-branch-admin-${suffix}@example.test`);
  officer = await login(`integration-officer-${suffix}@example.test`);
  otherBranchUser = await login(`integration-other-${suffix}@example.test`);

  const [container] = await db.insert(containersTable).values({
    branchId: branchAId,
    customerName: "Integration Test Customer",
    containerNumber: `INT-${suffix}`,
    blNumber: `BL-INT-${suffix}`,
    status: "pending_verification",
    verificationOfficerId: officerId,
    verificationOfficerIds: JSON.stringify([officerId]),
    berthingOfficerId: officerId,
    berthingOfficerIds: JSON.stringify([officerId]),
  }).returning({ id: containersTable.id });
  protectedContainerId = container.id;

  await db.insert(shippingChargesTable).values({
    branchId: branchAId,
    containerId: protectedContainerId,
    shippingCompany: "100",
  }).onConflictDoUpdate({
    target: shippingChargesTable.containerId,
    set: { branchId: branchAId, shippingCompany: "100", updatedAt: new Date() },
  });

  const [bank] = await db.insert(banksTable).values({
    name: `Integration Collection Bank ${suffix}`,
    branchId: branchAId,
  }).returning({ id: banksTable.id });
  collectionBankId = bank.id;
  const [transferBank] = await db.insert(banksTable).values({
    name: `Integration Transfer Bank ${suffix}`,
    branchId: branchAId,
  }).returning({ id: banksTable.id });
  transferBankId = transferBank.id;
  const [invoice] = await db.insert(invoicesTable).values({
    branchId: branchAId,
    containerId: protectedContainerId,
    invoiceNumber: `INT-COLLECTION-${suffix}`,
    status: "sent",
    subtotal: "250",
    total: "250",
  }).returning({ id: invoicesTable.id });
  collectionInvoiceId = invoice.id;

  const [expense] = await db.insert(overheadExpensesTable).values({
    branchId: branchAId,
    category: "Other",
    description: `Integration payment ${suffix}`,
    amount: "100000",
    recordedBy: adminId,
  }).returning({ id: overheadExpensesTable.id });
  paymentExpenseId = expense.id;
  const [schedule] = await db.insert(paymentSchedulesTable).values({
    branchId: branchAId,
    scheduleDate: new Date(),
    requestedById: adminId,
    overheadExpenseId: paymentExpenseId,
    vendorBeneficiary: "Integration vendor",
    description: `Integration schedule ${suffix}`,
    amountRequested: "100000",
    amountApproved: "40000",
    amountPaid: "0",
    status: "partially_approved",
  }).returning({ id: paymentSchedulesTable.id });
  paymentScheduleId = schedule.id;
  const [standaloneSchedule] = await db.insert(paymentSchedulesTable).values({
    branchId: branchAId,
    scheduleDate: new Date(),
    requestedById: adminId,
    vendorBeneficiary: "Integration standalone vendor",
    description: `Standalone schedule ${suffix}`,
    amountRequested: "500",
    amountApproved: "500",
    amountPaid: "0",
    status: "approved",
  }).returning({ id: paymentSchedulesTable.id });
  standaloneScheduleId = standaloneSchedule.id;
});

afterAll(async () => {
  if (collectionBankId || transferBankId) {
    await db.delete(bankTransfersTable).where(or(
      eq(bankTransfersTable.fromBankId, collectionBankId),
      eq(bankTransfersTable.toBankId, collectionBankId),
      eq(bankTransfersTable.fromBankId, transferBankId),
      eq(bankTransfersTable.toBankId, transferBankId),
    ));
  }
  if (collectionBankId) await db.delete(bankFundAdditionsTable).where(eq(bankFundAdditionsTable.bankId, collectionBankId));
  if (collectionInvoiceId) await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, collectionInvoiceId));
  if (collectionInvoiceId) await db.delete(invoicesTable).where(eq(invoicesTable.id, collectionInvoiceId));
  if (collectionClientId) await db.delete(clientsTable).where(eq(clientsTable.id, collectionClientId));
  if (transferBankId) await db.delete(banksTable).where(eq(banksTable.id, transferBankId));
  if (collectionBankId) await db.delete(banksTable).where(eq(banksTable.id, collectionBankId));
  if (paymentExpenseId) await db.delete(expensePaymentsTable).where(eq(expensePaymentsTable.expenseId, paymentExpenseId));
  if (standaloneScheduleId) await db.delete(paymentSchedulePaymentsTable).where(eq(paymentSchedulePaymentsTable.scheduleId, standaloneScheduleId));
  if (standaloneScheduleId) await db.delete(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, standaloneScheduleId));
  if (paymentScheduleId) await db.delete(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, paymentScheduleId));
  if (paymentExpenseId) await db.delete(overheadExpensesTable).where(eq(overheadExpensesTable.id, paymentExpenseId));
  if (protectedContainerId) await db.delete(containersTable).where(eq(containersTable.id, protectedContainerId));
  if (adminId || branchAdminId || officerId || otherBranchUserId || createdStaffUserId) {
    const testUserIds = [adminId, branchAdminId, officerId, otherBranchUserId, createdStaffUserId].filter(Boolean);
    await db.delete(workflowNotificationsTable).where(inArray(workflowNotificationsTable.targetUserId, testUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, testUserIds));
  }
  if (branchAId || branchBId) await db.delete(branchesTable).where(inArray(branchesTable.id, [branchAId, branchBId].filter(Boolean)));
});

describe("sensitive workflow integration", () => {
  it("enforces branch-admin user management boundaries", async () => {
    const visibleUsers = await branchAdmin.agent.get("/api/users");
    expect(visibleUsers.status).toBe(200);
    expect(visibleUsers.body.some((user: { id: number }) => user.id === otherBranchUserId)).toBe(false);

    const created = await branchAdmin.agent
      .post("/api/users")
      .set("X-CSRF-Token", branchAdmin.csrf)
      .send({
        name: "Integration Shipping Staff",
        email: `integration-shipping-${suffix}@example.test`,
        password,
        authorityLevel: "staff",
        jobFunction: "operations",
        workspaceAccess: ["shipping"],
        branchId: branchAId,
      });
    expect(created.status).toBe(201);
    expect(created.body.authorityLevel).toBe("staff");
    expect(created.body.jobFunction).toBe("operations");
    expect(created.body.workspaceAccess).toBe(JSON.stringify(["shipping"]));
    createdStaffUserId = created.body.id;

    const elevated = await branchAdmin.agent
      .post("/api/users")
      .set("X-CSRF-Token", branchAdmin.csrf)
      .send({
        name: "Unauthorized Admin",
        email: `integration-elevated-${suffix}@example.test`,
        password,
        authorityLevel: "admin",
        jobFunction: "general_staff",
        workspaceAccess: [],
        branchId: branchAId,
      });
    expect(elevated.status).toBe(403);

    const crossBranchRead = await branchAdmin.agent.get(`/api/users/${otherBranchUserId}`);
    expect(crossBranchRead.status).toBe(404);

    const staffDenied = await officer.agent.get("/api/users");
    expect(staffDenied.status).toBe(403);
  });

  it("blocks cross-branch task reads and writes", async () => {
    const read = await otherBranchUser.agent.get(`/api/containers/${protectedContainerId}/tasks`);
    expect(read.status).toBe(404);

    const write = await otherBranchUser.agent
      .post(`/api/containers/${protectedContainerId}/tasks`)
      .set("X-CSRF-Token", otherBranchUser.csrf)
      .send({ title: "Unauthorized cross-branch task" });
    expect(write.status).toBe(404);
  });

  it("allows only assigned verification and berthing officers to act", async () => {
    const denied = await admin.agent
      .post(`/api/containers/${protectedContainerId}/verify`)
      .set("X-CSRF-Token", admin.csrf);
    expect(denied.status).toBe(403);

    const verified = await officer.agent
      .post(`/api/containers/${protectedContainerId}/verify`)
      .set("X-CSRF-Token", officer.csrf);
    expect(verified.status).toBe(200);
    expect(verified.body.verifiedBy).toBe(officerId);

    const deniedBerthing = await admin.agent
      .post(`/api/containers/${protectedContainerId}/confirm-berthing`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ sendWhatsApp: false });
    expect(deniedBerthing.status).toBe(403);

    const confirmedBerthing = await officer.agent
      .post(`/api/containers/${protectedContainerId}/confirm-berthing`)
      .set("X-CSRF-Token", officer.csrf)
      .send({ sendWhatsApp: false });
    expect(confirmedBerthing.status).toBe(200);
    expect(confirmedBerthing.body.container.berthingConfirmedById).toBe(officerId);
  });

  it("stores targeted notifications when a task is assigned", async () => {
    const created = await admin.agent
      .post(`/api/containers/${protectedContainerId}/tasks`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ title: "Integration notification task", assignedStaffId: officerId });
    expect(created.status).toBe(201);

    const [notification] = await db.select().from(workflowNotificationsTable).where(and(
      eq(workflowNotificationsTable.targetUserId, officerId),
      eq(workflowNotificationsTable.containerId, protectedContainerId),
      eq(workflowNotificationsTable.type, "task_assigned"),
    ));
    expect(notification).toBeDefined();
    expect(notification.message).toContain("Integration notification task");
  });

  it("records an approved overhead schedule payment atomically and rejects an overpayment", async () => {
    const paid = await admin.agent
      .patch(`/api/payment-schedules/${paymentScheduleId}/pay`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 40000, paymentMethod: "cash", notes: "integration payment" });
    expect(paid.status).toBe(200);
    expect(paid.body.amountPaid).toBe(40000);
    expect(paid.body.status).toBe("paid");

    const payments = await db.select().from(expensePaymentsTable).where(and(
      eq(expensePaymentsTable.expenseId, paymentExpenseId),
      eq(expensePaymentsTable.paymentScheduleId, paymentScheduleId),
    ));
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(40000);

    const overpayment = await admin.agent
      .patch(`/api/payment-schedules/${paymentScheduleId}/pay`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 1, paymentMethod: "cash" });
    expect(overpayment.status).toBe(400);

    const paymentsAfter = await db.select().from(expensePaymentsTable).where(eq(expensePaymentsTable.expenseId, paymentExpenseId));
    expect(paymentsAfter).toHaveLength(1);
  });

  it("does not treat metadata IDs as container charge amounts", async () => {
    const reconciliation = await admin.agent.get(`/api/containers/${protectedContainerId}/reconciliation`);
    expect(reconciliation.status).toBe(200);
    expect(reconciliation.body.totals.budgeted).toBe(100);
    expect(reconciliation.body.sections.find((section: { section: string }) => section.section === "shipping")?.budgeted).toBe(100);
    expect(reconciliation.body.sections.find((section: { section: string }) => section.section === "customs")?.budgeted).toBe(0);
  });

  it("requires a bank for non-cash invoice collections and includes valid collections in the bank ledger", async () => {
    const missingBank = await admin.agent
      .post(`/api/invoices/${collectionInvoiceId}/payments`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 250, paymentMethod: "transfer" });
    expect(missingBank.status).toBe(400);

    const exceedsOutstanding = await admin.agent
      .post(`/api/invoices/${collectionInvoiceId}/payments`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 251, paymentMethod: "transfer", bankId: collectionBankId });
    expect(exceedsOutstanding.status).toBe(400);
    expect(exceedsOutstanding.body.error).toMatch(/exceeds.*outstanding/i);

    const posted = await admin.agent
      .post(`/api/invoices/${collectionInvoiceId}/payments`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 250, paymentMethod: "transfer", bankId: collectionBankId, reference: "integration-bank-posting" });
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe("paid");
    expect(posted.body.totalPaid).toBe(250);

    const [storedPayment] = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, collectionInvoiceId));
    expect(storedPayment.bankId).toBe(collectionBankId);

    const repeatPayment = await admin.agent
      .post(`/api/invoices/${collectionInvoiceId}/payments`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 1, paymentMethod: "transfer", bankId: collectionBankId, reference: "must-not-post" });
    expect(repeatPayment.status).toBe(400);
    expect(repeatPayment.body.error).toMatch(/already fully paid/i);

    const paymentsAfterRepeat = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, collectionInvoiceId));
    expect(paymentsAfterRepeat).toHaveLength(1);

    const banks = await admin.agent.get("/api/banks");
    expect(banks.status).toBe(200);
    expect(banks.body.find((bank: { id: number }) => bank.id === collectionBankId)?.currentBalance).toBe(250);
  });

  it("allows exactly one concurrent reversal for a historic invoice overpayment", async () => {
    const [reversalClient] = await db.insert(clientsTable).values({
      branchId: branchAId,
      name: `Integration reversal client ${suffix}`,
      creditBalance: "1",
    }).returning({ id: clientsTable.id });
    collectionClientId = reversalClient.id;

    await db.update(invoicesTable)
      .set({ clientId: collectionClientId })
      .where(eq(invoicesTable.id, collectionInvoiceId));

    const [historicOverpayment] = await db.insert(invoicePaymentsTable).values({
      branchId: branchAId,
      invoiceId: collectionInvoiceId,
      amount: "1",
      paymentMethod: "transfer",
      bankId: collectionBankId,
      reference: `integration-historic-overpayment-${suffix}`,
      notes: "Historic overpayment state for concurrent reversal regression coverage",
    }).returning({ id: invoicePaymentsTable.id });

    const reversalDate = new Date().toISOString().slice(0, 10);
    const responses = await Promise.all([
      admin.agent
        .post(`/api/invoices/${collectionInvoiceId}/payments/${historicOverpayment.id}/reverse`)
        .set("X-CSRF-Token", admin.csrf)
        .send({
          reversalDate,
          reference: `integration-reversal-a-${suffix}`,
          reason: "Concurrent reversal regression test A",
        }),
      branchAdmin.agent
        .post(`/api/invoices/${collectionInvoiceId}/payments/${historicOverpayment.id}/reverse`)
        .set("X-CSRF-Token", branchAdmin.csrf)
        .send({
          reversalDate,
          reference: `integration-reversal-b-${suffix}`,
          reason: "Concurrent reversal regression test B",
        }),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(responses.find(response => response.status === 409)?.body.error).toMatch(/already been reversed/i);

    const payments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, collectionInvoiceId));
    const reversals = payments.filter(payment => payment.entryType === "reversal" && payment.reversalOfPaymentId === historicOverpayment.id);
    expect(reversals).toHaveLength(1);
    expect(Number(reversals[0].amount)).toBe(-1);
    expect(payments.reduce((total, payment) => total + Number(payment.amount), 0)).toBe(250);

    const [invoice] = await db.select({ status: invoicesTable.status })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, collectionInvoiceId));
    expect(invoice.status).toBe("paid");

    const [storedClient] = await db.select({ creditBalance: clientsTable.creditBalance })
      .from(clientsTable)
      .where(eq(clientsTable.id, collectionClientId));
    expect(Number(storedClient.creditBalance)).toBe(0);

    const auditRows = await db.select().from(invoiceAuditLogTable)
      .where(and(
        eq(invoiceAuditLogTable.invoiceId, collectionInvoiceId),
        eq(invoiceAuditLogTable.action, "payment_reversed"),
      ));
    expect(auditRows).toHaveLength(1);
  });

  it("prevents duplicate references across bank fund additions and transfers", async () => {
    const reference = `integration-bank-reference-${suffix}`;
    const addition = await admin.agent
      .post(`/api/banks/${collectionBankId}/fund-additions`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 100, narration: "Integration bank reference guard", reference });
    expect(addition.status).toBe(201);

    const repeatedAddition = await admin.agent
      .post(`/api/banks/${collectionBankId}/fund-additions`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 100, narration: "Duplicate reference", reference: ` ${reference.toUpperCase()} ` });
    expect(repeatedAddition.status).toBe(409);

    const crossTypeDuplicate = await admin.agent
      .post("/api/banks/transfers")
      .set("X-CSRF-Token", admin.csrf)
      .send({ fromBankId: collectionBankId, toBankId: transferBankId, amount: 20, reference });
    expect(crossTypeDuplicate.status).toBe(409);

    const transfers = await db.select().from(bankTransfersTable)
      .where(or(eq(bankTransfersTable.fromBankId, collectionBankId), eq(bankTransfersTable.toBankId, transferBankId)));
    const additions = await db.select().from(bankFundAdditionsTable)
      .where(eq(bankFundAdditionsTable.bankId, collectionBankId));
    expect(transfers).toHaveLength(0);
    expect(additions).toHaveLength(1);
  });

  it("records a standalone schedule payment in the bank, financial ledger, and cash flow", async () => {
    const paid = await admin.agent
      .patch(`/api/payment-schedules/${standaloneScheduleId}/pay`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ amount: 500, paymentMethod: "bank", bankId: collectionBankId, reference: "integration-standalone-schedule" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("paid");
    expect(paid.body.amountPaid).toBe(500);

    const [payment] = await db.select().from(paymentSchedulePaymentsTable)
      .where(eq(paymentSchedulePaymentsTable.scheduleId, standaloneScheduleId));
    expect(payment).toBeDefined();
    expect(Number(payment.amount)).toBe(500);
    expect(payment.bankId).toBe(collectionBankId);

    const statement = await admin.agent.get(`/api/banks/${collectionBankId}/transactions?type=payment_schedule`);
    expect(statement.status).toBe(200);
    expect(statement.body.transactions).toHaveLength(1);
    expect(statement.body.transactions[0]).toMatchObject({ type: "payment_schedule", debit: 500, reference: "integration-standalone-schedule" });

    const ledger = await admin.agent.get("/api/reports/financial-ledger");
    expect(ledger.status).toBe(200);
    expect(ledger.body.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "Payment schedule", amount: 500, reference: "integration-standalone-schedule" }),
    ]));

    const cashFlow = await admin.agent.get("/api/reports/cashflow");
    expect(cashFlow.status).toBe(200);
    expect(cashFlow.body.outflows).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "payment_schedule", amount: 500, reference: "integration-standalone-schedule" }),
    ]));
  });
});
