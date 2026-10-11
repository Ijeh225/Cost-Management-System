import type { pool } from "@workspace/db";
import { resolveAccessProfile } from "./authorization.js";
import { ACCOUNTING_PERMISSIONS, accountingDate, journalHash, minorToMoney, normalizeJournal,
  requireAccounting, requireAccountingEnabled, validatePolicy, moneyToMinor, type AccountingPermission, type JournalInput } from "./accounting-rules.js";
import { financialDateKey } from "./financial-reporting.js";
import { isInvoiceFinanciallyActive } from "./invoice-status.js";
import { buildSettlementJournal, settlementEventKey, type AccountingSettlementRef, type SettlementMapping, type SettlementSource } from "./accounting-source-mapping.js";
import { buildInvoiceJournal, invoiceEventKey, type InvoiceAccountingMapping, type InvoiceAccountingSource } from "./accounting-invoice-mapping.js";
import { buildOperationalJournal, OPERATIONAL_SOURCE_KINDS, type OperationalMapping, type OperationalRef } from "./accounting-operational-mapping.js";
import { readOperationalSource } from "./accounting-operational-sources.js";
import { validateOperationalControls } from "./accounting-operational-controls.js";
import { buildReviewedOpening, type ReviewedOpening } from "./accounting-reviewed-opening.js";
import { sourceCoverage, type ReconciliationControl } from "./accounting-source-coverage.js";
import { buildAccountingReport, validateReportFilter, type ReportFilter, type ReportAccount, type ReportLine } from "./accounting-reports.js";

type Database = Pick<typeof pool, "connect">;
async function connectClient(database: Database) { return database.connect(); }
type Client = Awaited<ReturnType<typeof connectClient>>;
interface JournalRow { id: number; book_id: number; branch_id: number; status: string; prepared_by: number;
  currency: string; kind: string; event_key: string; payload_hash: string; }
interface ActorRow { id: number; branch_id: number; authority_level: string; job_function: string;
  workspace_access: string; access_profile_migrated_at: Date | null; is_active: boolean; }

// No operational writer calls this service. Approved mappings can prepare internal
// source drafts; deployment alone never activates or posts them.
export class NativeAccounting {
  constructor(private database: Database) {}

  private async transaction<T>(bookId: number | null, action: (client: Client) => Promise<T>, snapshot = false): Promise<T> {
    requireAccountingEnabled();
    const client = await this.database.connect();
    try {
      await client.query(snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
      if (bookId !== null) await client.query("SELECT pg_advisory_xact_lock(804610,$1)", [bookId]);
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async actor(client: Client, id: number): Promise<ActorRow> {
    const actor = (await client.query<ActorRow>(`SELECT id,branch_id,authority_level,job_function,workspace_access,
      access_profile_migrated_at,is_active FROM users WHERE id=$1 FOR SHARE`, [id])).rows[0];
    requireAccounting(actor?.is_active, "FORBIDDEN", "Active accounting user required");
    const profile = resolveAccessProfile({ authorityLevel: actor.authority_level, jobFunction: actor.job_function,
      workspaceAccess: actor.workspace_access, accessProfileMigratedAt: actor.access_profile_migrated_at });
    requireAccounting(profile.source === "modern", "FORBIDDEN", "Valid canonical access profile required");
    return actor;
  }
  private async permission(client: Client, bookId: number, branchId: number, actorId: number, permission: AccountingPermission) {
    const actor = await this.actor(client, actorId);
    requireAccounting(actor.branch_id === branchId || ["admin", "super_admin"].includes(actor.authority_level), "FORBIDDEN", "User is outside this accounting branch");
    const granted = (await client.query("SELECT accounting_has_grant($1,$2,$3,$4) allowed", [bookId, branchId, actorId, permission])).rows[0];
    requireAccounting(granted?.allowed, "FORBIDDEN", `Explicit ${permission} accounting grant required`);
  }
  private async bookPermission(client: Client, bookId: number, actorId: number, permission: AccountingPermission) {
    const branches = (await client.query("SELECT branch_id FROM accounting_book_branches WHERE book_id=$1", [bookId])).rows;
    requireAccounting(branches.length > 0, "INVALID_SCOPE", "Book branches required");
    for (const branch of branches) await this.permission(client, bookId, branch.branch_id, actorId, permission);
  }
  private async audit(client: Client, bookId: number, actorId: number, action: string, reason: string,
    branchId: number | null = null, journalId: number | null = null, periodId: number | null = null) {
    requireAccounting(typeof reason === "string" && reason.trim().length > 0 && reason.length <= 4000, "EVIDENCE_REQUIRED", "Audit evidence/reason is required");
    await client.query(`INSERT INTO accounting_audit(book_id,branch_id,actor_id,journal_id,period_id,action,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [bookId, branchId, actorId, journalId, periodId, action, reason.trim()]);
  }
  async createDraftBook(actorId: number, name: string, currency: string, branchIds: number[]) {
    requireAccounting(typeof name === "string" && name.trim().length > 0 && name.length <= 200 && /^[A-Z]{3}$/.test(currency), "INVALID_BOOK", "Book name and currency required");
    requireAccounting(branchIds.length > 0 && new Set(branchIds).size === branchIds.length
      && branchIds.every(id => Number.isSafeInteger(id) && id > 0), "INVALID_SCOPE", "Distinct branches are required");
    return this.transaction(null, async client => {
      const actor = await this.actor(client, actorId);
      requireAccounting(actor.authority_level === "super_admin", "FORBIDDEN", "Owner authority required for a new legal book");
      const id = (await client.query("INSERT INTO accounting_books(name,currency) VALUES($1,$2) RETURNING id", [name.trim(), currency])).rows[0].id as number;
      for (const branchId of branchIds) await client.query("INSERT INTO accounting_book_branches VALUES($1,$2)", [id, branchId]);
      await this.audit(client, id, actorId, "book_drafted", "Draft only; no chart, permissions or approval automatically granted");
      return id;
    });
  }
  async grantAccess(bookId: number, branchId: number, ownerId: number, userId: number, permission: AccountingPermission, evidence: string) {
    requireAccounting(ACCOUNTING_PERMISSIONS.includes(permission), "INVALID_PERMISSION", "Unknown accounting permission");
    return this.transaction(bookId, async client => {
      const owner = await this.actor(client, ownerId);
      requireAccounting(owner.authority_level === "super_admin", "FORBIDDEN", "Owner approval required for named accounting access");
      const target = await this.actor(client, userId);
      requireAccounting(target.branch_id === branchId || ["admin", "super_admin"].includes(target.authority_level), "FORBIDDEN", "Grant cannot expand branch access");
      requireAccounting(typeof evidence === "string" && evidence.trim().length > 0 && evidence.length <= 2000,
        "EVIDENCE_REQUIRED", "Named owner grant approval evidence is required");
      await this.audit(client, bookId, ownerId, "access_granted", JSON.stringify({ targetUserId: userId, permission, evidence }), branchId);
      await client.query(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(book_id,branch_id,user_id,permission) DO UPDATE SET evidence=excluded.evidence,granted_by=excluded.granted_by`,
      [bookId, branchId, userId, permission, evidence, ownerId]);
    });
  }
  async revokeAccess(bookId: number, branchId: number, ownerId: number, userId: number, permission: AccountingPermission, reason: string) {
    requireAccounting(ACCOUNTING_PERMISSIONS.includes(permission), "INVALID_PERMISSION", "Unknown accounting permission");
    requireAccounting(typeof reason === "string" && reason.trim().length > 0 && reason.length <= 2000,
      "EVIDENCE_REQUIRED", "Named revocation reason is required");
    return this.transaction(bookId, async client => {
      requireAccounting((await this.actor(client, ownerId)).authority_level === "super_admin", "FORBIDDEN", "Owner required");
      await this.audit(client, bookId, ownerId, "access_revoked", JSON.stringify({ targetUserId: userId, permission, reason }), branchId);
      await client.query("DELETE FROM accounting_grants WHERE book_id=$1 AND branch_id=$2 AND user_id=$3 AND permission=$4", [bookId, branchId, userId, permission]);
    });
  }
  async addAccount(bookId: number, branchId: number, actorId: number, code: string, name: string, category: string) {
    requireAccounting(typeof code === "string" && code.trim().length > 0 && typeof name === "string" && name.trim().length > 0
      && ["asset", "liability", "equity", "income", "expense"].includes(category), "INVALID_ACCOUNT", "Account code, name and family required");
    return this.transaction(bookId, async client => {
      await this.bookPermission(client, bookId, actorId, "configure");
      const account = (await client.query("INSERT INTO accounting_accounts(book_id,code,name,category) VALUES($1,$2,$3,$4) RETURNING id",
        [bookId, code.trim(), name.trim(), category])).rows[0].id as number;
      await this.audit(client, bookId, actorId, "account_created", `${code}: ${name}`, branchId);
      return account;
    });
  }
  async approveBook(bookId: number, branchId: number, actorId: number, approval: {
    policy: unknown; version: string; ownerEvidence: string; accountantEvidence: string;
  }) {
    validatePolicy(approval.policy);
    for (const value of [approval.version, approval.ownerEvidence, approval.accountantEvidence])
      requireAccounting(typeof value === "string" && value.trim().length > 0, "APPROVAL_REQUIRED", "Version and both documented approvals required");
    return this.transaction(bookId, async client => {
      await this.bookPermission(client, bookId, actorId, "configure");
      requireAccounting((await this.actor(client, actorId)).authority_level === "super_admin", "FORBIDDEN", "Owner must approve legal-book policy");
      const result = await client.query(`UPDATE accounting_books SET status='approved',policy=$2,policy_version=$3,
        owner_approval=$4,accountant_approval=$5,approved_by=$6,approved_at=now() WHERE id=$1 AND status='draft' RETURNING id`,
      [bookId, JSON.stringify(approval.policy), approval.version.trim(), approval.ownerEvidence.trim(), approval.accountantEvidence.trim(), actorId]);
      requireAccounting(result.rowCount === 1, "BOOK_STATE", "Draft book required");
      await this.audit(client, bookId, actorId, "policy_approved", `${approval.version}: ${approval.ownerEvidence}; ${approval.accountantEvidence}`, branchId);
    });
  }
  async createPeriod(bookId: number, branchId: number, actorId: number, name: string, startsOn: string, endsOn: string) {
    accountingDate(startsOn); accountingDate(endsOn);
    requireAccounting(startsOn <= endsOn && typeof name === "string" && name.trim().length > 0, "INVALID_PERIOD", "Valid named period required");
    return this.transaction(bookId, async client => {
      await this.bookPermission(client, bookId, actorId, "configure");
      const id = (await client.query("INSERT INTO accounting_periods(book_id,name,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id",
        [bookId, name.trim(), startsOn, endsOn])).rows[0].id as number;
      await this.audit(client, bookId, actorId, "period_created", `${name}: ${startsOn} to ${endsOn}`, branchId, null, id);
      return id;
    });
  }
  private async prepare(client: Client, actorId: number, input: JournalInput, reversalOf: number | null = null): Promise<JournalRow> {
    const normalized = normalizeJournal(input); const hash = journalHash(normalized);
    await this.permission(client, input.bookId, input.branchId, actorId, "prepare");
    if (reversalOf !== null) await this.permission(client, input.bookId, input.branchId, actorId, "reverse");
    const existing = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE book_id=$1 AND event_key=$2", [input.bookId, normalized.eventKey])).rows[0];
    if (existing) {
      requireAccounting(existing.payload_hash === hash && existing.prepared_by === actorId
        && existing.kind === (reversalOf === null ? "manual" : "reversal"), "DUPLICATE_CONFLICT", "Event key already exists with different payload or preparer");
      return existing;
    }
    if(!input.eventKey.startsWith("opening:")) {
      const pending=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key LIKE 'opening:%' AND status='draft' LIMIT 1",
        [input.bookId,input.branchId])).rows[0];
      requireAccounting(!pending,"CUTOVER_CONFLICT","Post the reviewed opening before forward journals");
    }
    const book = (await client.query("SELECT * FROM accounting_books WHERE id=$1", [input.bookId])).rows[0];
    requireAccounting(book?.status === "approved" && book.currency === input.currency && input.accountingDate >= book.policy.cutoverDate,
      "BOOK_NOT_APPROVED", "Approved matching currency, policy and cutover required");
    const period = (await client.query("SELECT id FROM accounting_periods WHERE book_id=$1 AND status='open' AND $2::date BETWEEN starts_on AND ends_on",
      [input.bookId, input.accountingDate])).rows[0];
    requireAccounting(period, "PERIOD_CLOSED", "Accounting date has no open period");
    const accounts = (await client.query("SELECT id FROM accounting_accounts WHERE book_id=$1 AND active AND id=ANY($2::int[])",
      [input.bookId, normalized.lines.map(line => line.accountId)])).rows;
    requireAccounting(new Set(accounts.map(row => row.id)).size === new Set(normalized.lines.map(l => l.accountId)).size,
      "INVALID_ACCOUNT", "All accounts must be active and belong to this book");
    const journal = (await client.query<JournalRow>(`INSERT INTO accounting_journals(book_id,branch_id,period_id,currency,accounting_date,event_key,
      payload_hash,narration,evidence,kind,reversal_of,prepared_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [input.bookId, input.branchId, period.id, input.currency, input.accountingDate, normalized.eventKey, hash,
      normalized.narration, normalized.evidence, reversalOf === null ? "manual" : "reversal", reversalOf, actorId])).rows[0]!;
    for (const line of normalized.lines) await client.query(`INSERT INTO accounting_journal_lines(book_id,journal_id,account_id,debit_minor,credit_minor,memo)
      VALUES($1,$2,$3,$4,$5,$6)`, [input.bookId, journal.id, line.accountId, line.debitMinor, line.creditMinor, line.memo]);
    await client.query("INSERT INTO accounting_source_events(book_id,event_key,journal_id) VALUES($1,$2,$3)", [input.bookId, normalized.eventKey, journal.id]);
    await this.audit(client, input.bookId, actorId, "prepared", normalized.evidence, input.branchId, journal.id);
    return journal;
  }
  async prepareJournal(actorId: number, input: JournalInput) {
    requireAccounting(!/^(source|opening):/.test(input.eventKey), "RESERVED_EVENT", "Source and opening identities require their dedicated reviewed workflow");
    normalizeJournal(input);
    return this.transaction(input.bookId, client => this.prepare(client, actorId, input));
  }
  private async invoiceDraft(client: Client, bookId: number, branchId: number, actorId: number,
    invoiceId: number, mapping: InvoiceAccountingMapping, permission: "read" | "prepare") {
    invoiceEventKey(invoiceId);
    await this.permission(client, bookId, branchId, actorId, permission);
    const book = (await client.query("SELECT * FROM accounting_books WHERE id=$1", [bookId])).rows[0];
    requireAccounting(book?.status === "approved" && book.policy_version === mapping.policyVersion && book.currency === mapping.currency,
      "BOOK_NOT_APPROVED", "Matching approved book currency and policy version required");
    const row = (await client.query("SELECT *,created_at AT TIME ZONE 'UTC' AS created_at FROM invoices WHERE id=$1 AND branch_id=$2 FOR SHARE", [invoiceId, branchId])).rows[0];
    requireAccounting(row, "NOT_FOUND", "Invoice not found in this branch");
    const originalPosted=(await client.query("SELECT status FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3",
      [bookId,branchId,invoiceEventKey(invoiceId)])).rows[0]?.status === "posted";
    requireAccounting(["sent", "partial", "paid", "overdue",...(originalPosted ? ["written_off"] : [])].includes(row.status)
      && (originalPosted || !row.written_off_amount || moneyToMinor(row.written_off_amount) === 0n),
    "SOURCE_REVIEW_REQUIRED", "Adjusted historical invoices need previously posted original recognition; do not reconstruct it from guesses");
    const customer = (await client.query("SELECT branch_id FROM clients WHERE id=$1 FOR SHARE", [row.client_id])).rows[0];
    requireAccounting(customer?.branch_id === branchId, "SOURCE_REVIEW_REQUIRED", "Linked invoice customer must belong to this branch");
    const credits = (await client.query("SELECT id FROM credit_notes WHERE invoice_id=$1 AND status='active' FOR SHARE", [invoiceId])).rows;
    requireAccounting(credits.length === 0 || originalPosted, "SOURCE_REVIEW_REQUIRED", "Credit-note history requires previously posted original recognition");
    const items = (await client.query("SELECT id,branch_id,container_id,amount FROM invoice_items WHERE invoice_id=$1 ORDER BY id FOR SHARE", [invoiceId])).rows;
    requireAccounting(items.every(item => item.branch_id === branchId), "SOURCE_REVIEW_REQUIRED", "Invoice items cannot cross branches");
    const containerIds = [...new Set(items.flatMap(item => item.container_id === null ? [] : [item.container_id]))];
    if (containerIds.length) {
      const containers = (await client.query("SELECT id,branch_id FROM containers WHERE id=ANY($1::int[]) FOR SHARE", [containerIds])).rows;
      requireAccounting(containers.length === containerIds.length && containers.every(container => container.branch_id === branchId),
        "SOURCE_REVIEW_REQUIRED", "All linked invoice containers must belong to this branch");
    }
    const source: InvoiceAccountingSource = { kind: "invoice", id: invoiceId, branchId, clientId: row.client_id,
      createdDate: financialDateKey(new Date(row.created_at)), subtotal: row.subtotal, vatAmount: row.vat_amount, total: row.total,
      items: items.map(item => ({ id: item.id, containerId: item.container_id, amount: item.amount })) };
    const draft = buildInvoiceJournal(bookId, source, mapping);
    requireAccounting(draft.input.accountingDate >= book.policy.cutoverDate, "BEFORE_CUTOVER", "Earlier recognition requires approved openings/import");
    if(source.createdDate<book.policy.cutoverDate && !originalPosted) {
      const opening=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key LIKE 'opening:%' AND status='posted'",
        [bookId,branchId])).rows[0];
      requireAccounting(!opening,"CUTOVER_CONFLICT","Legacy invoice may already be in openings; invoice-specific dated coverage is required before recognizing it again");
    }
    const accounts = (await client.query("SELECT id,category FROM accounting_accounts WHERE book_id=$1 AND active AND id=ANY($2::int[])",
      [bookId, [...draft.requiredCategories.keys()]])).rows;
    const categories = new Map(accounts.map(account => [account.id, account.category]));
    requireAccounting([...draft.requiredCategories].every(([id, category]) => categories.get(id) === category),
      "INVALID_MAPPING", "Each reviewed AR, income, client-funds and tax account must be active and correctly classified in this book");
    return { ...draft, source };
  }
  async previewInvoice(bookId: number, branchId: number, actorId: number, invoiceId: number, mapping: InvoiceAccountingMapping) {
    return this.transaction(bookId, client => this.invoiceDraft(client, bookId, branchId, actorId, invoiceId, mapping, "read"));
  }
  async prepareInvoice(bookId: number, branchId: number, actorId: number, invoiceId: number, mapping: InvoiceAccountingMapping) {
    return this.transaction(bookId, async client => {
      const draft = await this.invoiceDraft(client, bookId, branchId, actorId, invoiceId, mapping, "prepare");
      const journal = await this.prepare(client, actorId, draft.input);
      requireAccounting(journal.status !== "cancelled", "SOURCE_CANCELLED", "Cancelled invoice draft requires reviewed correction, not a second posting");
      return journal;
    });
  }
  private async settlementDraft(client: Client, bookId: number, branchId: number, actorId: number,
    ref: AccountingSettlementRef, mapping: SettlementMapping, permission: "read" | "prepare") {
    settlementEventKey(ref);
    await this.permission(client, bookId, branchId, actorId, permission);
    const book = (await client.query("SELECT * FROM accounting_books WHERE id=$1", [bookId])).rows[0];
    requireAccounting(book?.status === "approved" && book.policy_version === mapping.policyVersion && book.currency === mapping.currency,
      "BOOK_NOT_APPROVED", "Matching approved book currency and policy version required");
    let source: SettlementSource;
    if (ref.kind === "client_deposit") {
      const row = (await client.query(`SELECT d.*,d.created_at AT TIME ZONE 'UTC' AS created_at,c.branch_id client_branch FROM client_deposits d
        JOIN clients c ON c.id=d.client_id WHERE d.id=$1 AND d.branch_id=$2 FOR SHARE OF d,c`, [ref.id, branchId])).rows[0];
      requireAccounting(row && row.client_branch === branchId, "NOT_FOUND", "Deposit not found in this branch");
      requireAccounting(!row.notes?.includes("[VOIDED by wallet reset"), "SOURCE_REVIEW_REQUIRED", "Voided deposit needs explicit historical review");
      source = { kind:ref.kind,id:ref.id, branchId, clientId: row.client_id, amount: row.amount, bankId: row.bank_id,
        paymentMethod: row.payment_method, accountingDate: financialDateKey(new Date(row.created_at)) };
    } else {
      const row = (await client.query(`SELECT p.*,p.paid_at AT TIME ZONE 'UTC' AS paid_at,i.client_id,i.status invoice_status,i.branch_id invoice_branch,i.total invoice_total,i.written_off_amount
        FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
        WHERE p.id=$1 AND p.branch_id=$2 FOR SHARE OF p,i`, [ref.id, branchId])).rows[0];
      requireAccounting(row && row.invoice_branch === branchId, "NOT_FOUND", "Invoice settlement not found in this branch");
      const originalInvoice=(await client.query("SELECT status,evidence,payload_hash FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3",
        [bookId,branchId,invoiceEventKey(row.invoice_id)])).rows[0];
      const originalPosted=originalInvoice?.status === "posted";
      if(originalPosted) {
        const saved=JSON.parse(originalInvoice.evidence);
        requireAccounting(mapping.receivableAccountId===saved.mapping.receivableAccountId,"INVALID_MAPPING","Collections must settle the originally recognized AR control");
        const current=await this.invoiceDraft(client,bookId,branchId,actorId,row.invoice_id,saved.mapping,"read");
        requireAccounting(journalHash(normalizeJournal(current.input))===originalInvoice.payload_hash,"SOURCE_CHANGED","Invoice facts changed after recognition");
      }
      requireAccounting((isInvoiceFinanciallyActive(row.invoice_status) || originalPosted && row.invoice_status==="written_off")
        && ["sent", "partial", "paid", "overdue",...(originalPosted ? ["written_off"] : [])].includes(row.invoice_status),
        "SOURCE_REVIEW_REQUIRED", "Unknown/draft/cancelled/written-off invoice history needs its own reviewed treatment");
      if(row.invoice_status==="written_off") {
        const audit=(await client.query("SELECT created_at AT TIME ZONE 'UTC' AS created_at FROM invoice_audit_log WHERE invoice_id=$1 AND action='written_off' ORDER BY id",[row.invoice_id])).rows;
        requireAccounting(audit.length===1 && new Date(row.paid_at)<=new Date(audit[0].created_at),
          "SOURCE_REVIEW_REQUIRED","Historical pre-write-off settlement only; unimplemented bad-debt recovery is not an ordinary collection");
        const postedWriteoff=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND status='posted' AND event_key IN (SELECT 'source:invoice_writeoff:'||id||':v1' FROM invoice_audit_log WHERE invoice_id=$3 AND action='written_off')",
          [bookId,branchId,row.invoice_id])).rows[0];
        const postedPayment=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3 AND status='posted'",
          [bookId,branchId,settlementEventKey(ref)])).rows[0];
        requireAccounting(!postedWriteoff || postedPayment,"SOURCE_REVIEW_REQUIRED","Do not add backdated collections after an already posted write-off");
      }
      const credits = (await client.query("SELECT id FROM credit_notes WHERE invoice_id=$1 AND status='active' FOR SHARE", [row.invoice_id])).rows;
      const prior = (await client.query(`SELECT coalesce(sum(amount),0)::text amount FROM invoice_payments
        WHERE invoice_id=$1 AND (paid_at,id)<=($2::timestamptz AT TIME ZONE 'UTC',$3)`, [row.invoice_id, row.paid_at, row.id])).rows[0];
      requireAccounting((originalPosted || credits.length === 0 && (!row.written_off_amount || moneyToMinor(row.written_off_amount) === 0n))
        && moneyToMinor(prior.amount) <= moneyToMinor(row.invoice_total), "SOURCE_REVIEW_REQUIRED",
      "Credit-note, write-off and excess-collection history requires its own reviewed mapping");
      if (row.source_deposit_id !== null) {
        const deposit = (await client.query("SELECT *,created_at AT TIME ZONE 'UTC' AS created_at FROM client_deposits WHERE id=$1 FOR SHARE", [row.source_deposit_id])).rows[0];
        requireAccounting(deposit && deposit.branch_id === branchId && deposit.client_id === row.client_id
          && !deposit.notes?.includes("[VOIDED by wallet reset") && new Date(deposit.created_at) <= new Date(row.paid_at),
        "SOURCE_REVIEW_REQUIRED", "Matching non-voided, previously received client deposit required");
        const allocated = (await client.query(`SELECT coalesce(sum(amount),0)::text amount FROM invoice_payments
          WHERE source_deposit_id=$1 AND (paid_at,id)<=($2::timestamptz AT TIME ZONE 'UTC',$3)`, [deposit.id, row.paid_at, row.id])).rows[0];
        requireAccounting(moneyToMinor(allocated.amount) <= moneyToMinor(deposit.amount),
          "SOURCE_REVIEW_REQUIRED", "Deposit allocation exceeds the received deposit");
        const depositJournal = (await client.query(`SELECT status,payload_hash FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3`,
          [bookId, branchId, settlementEventKey({ kind: "client_deposit", id: deposit.id })])).rows[0];
        requireAccounting(depositJournal?.status === "posted", "DEPOSIT_NOT_POSTED", "Post the deposit receipt before its allocation; opening liabilities need a separate approved workflow");
        const receipt = buildSettlementJournal(bookId, { kind: "client_deposit", id: deposit.id, branchId, clientId: deposit.client_id,
          amount: deposit.amount, bankId: deposit.bank_id, paymentMethod: deposit.payment_method,
          accountingDate: financialDateKey(new Date(deposit.created_at)) }, mapping);
        requireAccounting(journalHash(normalizeJournal(receipt.input)) === depositJournal.payload_hash,
          "SOURCE_CHANGED", "Deposit receipt evidence changed after posting; review before allocating");
      }
      if (row.entry_type === "reversal") {
        const original = (await client.query("SELECT *,paid_at AT TIME ZONE 'UTC' AS paid_at FROM invoice_payments WHERE id=$1 FOR SHARE", [row.reversal_of_payment_id])).rows[0];
        requireAccounting(original && original.entry_type === "payment" && original.branch_id === branchId
          && original.invoice_id === row.invoice_id && original.amount === row.amount.slice(1)
          && original.bank_id === row.bank_id && original.source_deposit_id === row.source_deposit_id
          && original.payment_method === row.payment_method && new Date(original.paid_at) <= new Date(row.paid_at),
        "INVALID_REVERSAL", "Matching original settlement and full dated reversal required");
      }
      source = { kind:ref.kind,id:ref.id, branchId, clientId: row.client_id, invoiceId: row.invoice_id, amount: row.amount, bankId: row.bank_id,
        sourceDepositId: row.source_deposit_id, reversalOfId: row.reversal_of_payment_id, entryType: row.entry_type,
        paymentMethod: row.payment_method, accountingDate: financialDateKey(new Date(row.paid_at)) };
    }
    const customer = (await client.query("SELECT branch_id FROM clients WHERE id=$1 FOR SHARE", [source.clientId])).rows[0];
    requireAccounting(customer?.branch_id === branchId, "SOURCE_REVIEW_REQUIRED", "Source customer must belong to this branch");
    requireAccounting(source.accountingDate >= book.policy.cutoverDate, "BEFORE_CUTOVER", "Earlier source belongs to approved openings/import, not forward posting");
    if (source.bankId !== null) {
      const bank = (await client.query("SELECT branch_id FROM banks WHERE id=$1 FOR SHARE", [source.bankId])).rows[0];
      requireAccounting(bank?.branch_id === branchId, "SOURCE_REVIEW_REQUIRED", "Source bank must belong to this branch");
    }
    const draft = buildSettlementJournal(bookId, source, mapping);
    const accounts = (await client.query("SELECT id,category FROM accounting_accounts WHERE book_id=$1 AND active AND id=ANY($2::int[])",
      [bookId, [draft.debitAccountId, draft.creditAccountId]])).rows;
    const categories = new Map(accounts.map(row => [row.id, row.category]));
    requireAccounting(categories.get(draft.debitAccountId) === (draft.allocation ? "liability" : "asset")
      && categories.get(draft.creditAccountId) === (ref.kind === "client_deposit" ? "liability" : "asset"),
    "INVALID_MAPPING", "Approved active asset/liability control accounts in this book required");
    return { ...draft, source };
  }
  async previewSettlement(bookId: number, branchId: number, actorId: number, ref: AccountingSettlementRef, mapping: SettlementMapping) {
    return this.transaction(bookId, client => this.settlementDraft(client, bookId, branchId, actorId, ref, mapping, "read"));
  }
  async prepareSettlement(bookId: number, branchId: number, actorId: number, ref: AccountingSettlementRef, mapping: SettlementMapping) {
    return this.transaction(bookId, async client => {
      const draft = await this.settlementDraft(client, bookId, branchId, actorId, ref, mapping, "prepare");
      let originalId: number | null = null;
      if (draft.reversal) {
        const original = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3",
          [bookId, branchId, settlementEventKey({ kind: "invoice_payment", id: draft.source.reversalOfId! })])).rows[0];
        requireAccounting(original?.status === "posted", "ORIGINAL_NOT_POSTED", "Original source journal must be posted before its reversal");
        const lines = (await client.query("SELECT account_id,debit_minor::text,credit_minor::text FROM accounting_journal_lines WHERE journal_id=$1 ORDER BY id", [original.id])).rows;
        const normalized = normalizeJournal(draft.input);
        requireAccounting(lines.length === normalized.lines.length && lines.every((line, index) => {
          const reversed = normalized.lines[normalized.lines.length - 1 - index]!;
          return line.account_id === reversed.accountId && line.debit_minor === reversed.creditMinor && line.credit_minor === reversed.debitMinor;
        }), "INVALID_REVERSAL", "Source reversal must exactly offset the originally posted accounts");
        const prior = (await client.query("SELECT event_key FROM accounting_journals WHERE reversal_of=$1 AND status<>'cancelled'", [original.id])).rows[0];
        requireAccounting(!prior || prior.event_key === draft.input.eventKey, "ALREADY_REVERSED", "Original already has another linked accounting reversal");
        originalId = original.id;
      }
      const journal = await this.prepare(client, actorId, draft.input, originalId);
      requireAccounting(journal.status !== "cancelled", "SOURCE_CANCELLED", "Cancelled source draft requires reviewed correction, not a second posting");
      return journal;
    });
  }
  private async operationalDraft(client:Client,bookId:number,branchId:number,actorId:number,
    ref:OperationalRef,mapping:OperationalMapping,permission:"read"|"prepare") {
    await this.permission(client,bookId,branchId,actorId,permission);
    const book=(await client.query("SELECT * FROM accounting_books WHERE id=$1",[bookId])).rows[0];
    requireAccounting(book?.status==="approved" && book.policy_version===mapping.policyVersion && book.currency===mapping.currency,
      "BOOK_NOT_APPROVED","Matching approved currency/policy required");
    const source=await readOperationalSource(client,branchId,ref);
    const draft=buildOperationalJournal(bookId,source,mapping);
    requireAccounting(draft.input.accountingDate>=book.policy.cutoverDate,"BEFORE_CUTOVER","Earlier sources need reviewed openings/import");
    const accounts=(await client.query("SELECT id,category FROM accounting_accounts WHERE book_id=$1 AND active AND id=ANY($2::int[])",
      [bookId,[...draft.requiredCategories.keys()]])).rows;
    const categories=new Map(accounts.map(a=>[a.id,a.category]));
    requireAccounting([...draft.requiredCategories].every(([id,category])=>categories.get(id)===category),"INVALID_MAPPING","Active correctly classified own-book accounts required");
    if(source.invoiceId) {
      const original=(await client.query("SELECT evidence,payload_hash,status FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3",
        [bookId,branchId,invoiceEventKey(source.invoiceId)])).rows[0];
      requireAccounting(original?.status==="posted","SOURCE_NOT_POSTED","Original invoice recognition must already be posted");
      const saved=JSON.parse(original.evidence);
      const current=await this.invoiceDraft(client,bookId,branchId,actorId,source.invoiceId,saved.mapping,"read");
      requireAccounting(journalHash(normalizeJournal(current.input))===original.payload_hash,"SOURCE_CHANGED","Original invoice facts changed after recognition");
      const earlier=(await client.query(`SELECT j.evidence,j.payload_hash FROM accounting_journals j
        WHERE j.book_id=$1 AND j.branch_id=$2 AND j.status='posted' AND j.event_key<>$3 AND
        (j.event_key IN (SELECT 'source:invoice_payment:'||id||':v1' FROM invoice_payments WHERE invoice_id=$4 AND paid_at<=$5::timestamp)
         OR j.event_key IN (SELECT 'source:credit_note:'||id||':v1' FROM credit_notes WHERE invoice_id=$4 AND created_at<=$5::timestamp))`,
        [bookId,branchId,draft.input.eventKey,source.invoiceId,source.facts.recordedAt])).rows;
      for(const row of earlier) {
        const posted=JSON.parse(row.evidence);
        if(OPERATIONAL_SOURCE_KINDS.includes(posted.source.kind)) {
          const current=buildOperationalJournal(bookId,await readOperationalSource(client,branchId,posted.source),posted.mapping);
          requireAccounting(journalHash(normalizeJournal(current.input))===row.payload_hash,"SOURCE_CHANGED","Earlier adjustment facts changed after posting");
        } else {
          const current=await this.settlementDraft(client,bookId,branchId,actorId,posted.source,posted.mapping,"read");
          requireAccounting(journalHash(normalizeJournal(current.input))===row.payload_hash,"SOURCE_CHANGED","Earlier collection facts changed after posting");
        }
      }
    }
    const originalId=await validateOperationalControls(client,bookId,branchId,draft);
    return {...draft,originalId};
  }
  async previewOperational(bookId:number,branchId:number,actorId:number,ref:OperationalRef,mapping:OperationalMapping) {
    return this.transaction(bookId,client=>this.operationalDraft(client,bookId,branchId,actorId,ref,mapping,"read"));
  }
  async prepareOperational(bookId:number,branchId:number,actorId:number,ref:OperationalRef,mapping:OperationalMapping) {
    return this.transaction(bookId,async client=>{
      const draft=await this.operationalDraft(client,bookId,branchId,actorId,ref,mapping,"prepare");
      const journal=await this.prepare(client,actorId,draft.input,draft.originalId);
      requireAccounting(journal.status!=="cancelled","SOURCE_CANCELLED","Cancelled source requires reviewed correction, not duplicate posting");
      return journal;
    });
  }
  private async openingDraft(client:Client,actorId:number,review:ReviewedOpening,permission:"read"|"prepare") {
    await this.permission(client,review.bookId,review.branchId,actorId,permission);
    const draft=buildReviewedOpening(review);
    const book=(await client.query("SELECT * FROM accounting_books WHERE id=$1",[review.bookId])).rows[0];
    requireAccounting(book?.status==="approved" && book.currency===review.currency && book.policy_version===review.policyVersion
      && book.policy.cutoverDate===review.cutoverDate,"BOOK_NOT_APPROVED","Opening must match approved book/cutover");
    const accounts=(await client.query("SELECT id FROM accounting_accounts WHERE book_id=$1 AND active AND id=ANY($2::int[])",
      [review.bookId,review.lines.map(l=>l.accountId)])).rows;
    requireAccounting(new Set(accounts.map(a=>a.id)).size===new Set(review.lines.map(l=>l.accountId)).size,"INVALID_MAPPING","Active own-book opening accounts required");
    const existing=(await client.query("SELECT status,payload_hash FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3",
      [review.bookId,review.branchId,draft.input.eventKey])).rows[0];
    if(existing?.status==="posted") {
      requireAccounting(existing.payload_hash===journalHash(normalizeJournal(draft.input)),"DUPLICATE_CONFLICT","Posted opening is immutable"); return draft;
    }
    const overlap=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key<>$3 AND status<>'cancelled' LIMIT 1",
      [review.bookId,review.branchId,draft.input.eventKey])).rows[0];
    requireAccounting(!overlap,"CUTOVER_CONFLICT","Prepare/post the opening before forward journals; no mixed historical import");
    return draft;
  }
  async previewOpening(actorId:number,review:ReviewedOpening) {
    return this.transaction(review.bookId,client=>this.openingDraft(client,actorId,review,"read"));
  }
  async prepareOpening(actorId:number,review:ReviewedOpening) {
    return this.transaction(review.bookId,async client=>{
      const draft=await this.openingDraft(client,actorId,review,"prepare");
      const journal=await this.prepare(client,actorId,draft.input);
      requireAccounting(journal.status!=="cancelled","SOURCE_CANCELLED","Cancelled opening requires reviewed correction");
      return journal;
    });
  }
  async reconcileSources(bookId:number,branchId:number,actorId:number,through:string,controls:ReconciliationControl[]) {
    accountingDate(through);
    return this.transaction(bookId,async client=>{
      await this.permission(client,bookId,branchId,actorId,"read");
      return this.coverage(client,bookId,branchId,actorId,through,controls);
    });
  }
  private async coverage(client:Client,bookId:number,branchId:number,actorId:number,through:string,controls:ReconciliationControl[]) {
      const report=await sourceCoverage(client,bookId,branchId,through,controls);
      for(const item of report.sources.filter(s=>s.status==="posted")) {
        try {
          const journal=(await client.query("SELECT evidence,payload_hash FROM accounting_journals WHERE book_id=$1 AND event_key=$2",[bookId,item.eventKey])).rows[0];
          const saved=JSON.parse(journal.evidence);
          const draft=saved.source.kind==="invoice" ? await this.invoiceDraft(client,bookId,branchId,actorId,saved.source.id,saved.mapping,"read")
            : OPERATIONAL_SOURCE_KINDS.includes(saved.source.kind) ? await this.operationalDraft(client,bookId,branchId,actorId,saved.source,saved.mapping,"read")
              : await this.settlementDraft(client,bookId,branchId,actorId,saved.source,saved.mapping,"read");
          requireAccounting(journalHash(normalizeJournal(draft.input))===journal.payload_hash,"SOURCE_CHANGED","Posted evidence differs from current source");
        } catch(error) { item.status="stale"; item.reason=error instanceof Error ? error.message : "Source revalidation failed"; }
      }
      return {...report,complete:report.sources.every(s=>s.status==="posted" || s.status==="excluded")
        && report.controls.every(c=>c.difference==="0.00") && report.missingControls.length===0 && controls.length>0};
  }

  async reportCatalog(actorId:number,branchId:number|null) {
    return this.transaction(null,async client=>{
      const actor=await this.actor(client,actorId);
      const books=(await client.query(`SELECT b.id,b.name,b.currency,b.policy_version AS "policyVersion",b.policy->>'cutoverDate' AS "cutoverDate",
        bb.branch_id AS "branchId",br.name AS "branchName" FROM accounting_books b
        JOIN accounting_book_branches bb ON bb.book_id=b.id JOIN branches br ON br.id=bb.branch_id
        WHERE b.status='approved' AND ($2::int IS NULL OR bb.branch_id=$2)
        AND (bb.branch_id=$3 OR $4) AND accounting_has_grant(b.id,bb.branch_id,$1,'read') ORDER BY b.id,bb.branch_id`,
        [actorId,branchId,actor.branch_id,["admin","super_admin"].includes(actor.authority_level)])).rows;
      return {status:"active" as const,books};
    },true);
  }
  private async reportingScope(client:Client,bookId:number,branchId:number|null,actorId:number) {
    requireAccounting(Number.isSafeInteger(bookId) && bookId>0 && (branchId===null || Number.isSafeInteger(branchId) && branchId>0),"INVALID_SCOPE","Valid book/branch required");
    const book=(await client.query("SELECT id,name,currency,policy_version,policy FROM accounting_books WHERE id=$1 AND status='approved'",[bookId])).rows[0];
    requireAccounting(book,"BOOK_NOT_APPROVED","Approved accounting book required");
    const branches=(await client.query(`SELECT bb.branch_id id,b.name FROM accounting_book_branches bb JOIN branches b ON b.id=bb.branch_id
      WHERE bb.book_id=$1 AND ($2::int IS NULL OR bb.branch_id=$2) ORDER BY bb.branch_id`,[bookId,branchId])).rows;
    requireAccounting(branches.length>0,"INVALID_SCOPE","Branch is outside this book");
    for(const branch of branches) await this.permission(client,bookId,branch.id,actorId,"read");
    return {book,branches};
  }
  async reportOptions(bookId:number,branchId:number|null,actorId:number) {
    return this.transaction(bookId,async client=>{
      const scope=await this.reportingScope(client,bookId,branchId,actorId);
      const accounts=(await client.query<ReportAccount>("SELECT id,code,name,category,active FROM accounting_accounts WHERE book_id=$1 ORDER BY code,id",[bookId])).rows;
      const periods=(await client.query(`SELECT id,name,starts_on::text AS "from",ends_on::text AS "to",status FROM accounting_periods WHERE book_id=$1 ORDER BY starts_on,id`,[bookId])).rows;
      return {book:{id:scope.book.id,name:scope.book.name,currency:scope.book.currency,cutoverDate:scope.book.policy.cutoverDate},branches:scope.branches,accounts,periods};
    },true);
  }
  async accountingReport(bookId:number,branchId:number|null,actorId:number,kind:"general-ledger"|"trial-balance",filter:ReportFilter) {
    validateReportFilter(filter);
    requireAccounting(["general-ledger","trial-balance"].includes(kind),"INVALID_FILTER","Supported report kind required");
    return this.transaction(bookId,async client=>{
      const {book,branches}=await this.reportingScope(client,bookId,branchId,actorId);
      requireAccounting(filter.from>=book.policy.cutoverDate,"PRE_CUTOVER","Report starts before approved accounting cutover");
      if(filter.periodId) {
        const period=(await client.query("SELECT starts_on::text,ends_on::text FROM accounting_periods WHERE book_id=$1 AND id=$2",[bookId,filter.periodId])).rows[0];
        requireAccounting(period && filter.from>=period.starts_on && filter.to<=period.ends_on,"INVALID_PERIOD","Dates must fall within the selected book period");
      }
      const accounts=(await client.query<ReportAccount>("SELECT id,code,name,category,active FROM accounting_accounts WHERE book_id=$1 ORDER BY code,id",[bookId])).rows;
      const lines=(await client.query<ReportLine>(`SELECT l.id,l.journal_id AS "journalId",l.account_id AS "accountId",j.branch_id AS "branchId",
        j.accounting_date::text date,j.status,j.kind,j.event_key AS "eventKey",j.narration,l.memo,
        l.debit_minor::text AS "debitMinor",l.credit_minor::text AS "creditMinor"
        FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id
        WHERE j.book_id=$1 AND l.book_id=$1 AND j.branch_id=ANY($2::int[]) AND j.status='posted' AND j.accounting_date<=$3::date
        ORDER BY j.accounting_date,j.id,l.id LIMIT 50001`,[bookId,branches.map(b=>b.id),filter.to])).rows;
      requireAccounting(lines.length<=50000,"REPORT_TOO_LARGE","Report exceeds 50,000 posted lines; choose a narrower branch/book scope");
      const report=buildAccountingReport(accounts,lines,filter,kind);
      const coverage=[];
      for(const branch of branches) {
        const checked=await this.coverage(client,bookId,branch.id,actorId,filter.to,[]);
        const exceptions=checked.sources.filter(s=>s.status!=="posted" && s.status!=="excluded");
        const counts:Record<string,number>={}; for(const source of checked.sources) counts[source.status]=(counts[source.status]??0)+1;
        coverage.push({branchId:branch.id,counts,exceptionCount:exceptions.length,exceptions:exceptions.slice(0,100),
          exceptionsTruncated:exceptions.length>100,missingControlAccountIds:checked.missingControls,independentControlsVerified:false});
      }
      const warnings=["Posted native journals only; existing budgeted/cash reports are separate.",
        "Debit/credit equality does not prove correct source coverage or independently reconciled control balances.",
        "Independent dated account controls have not been supplied for this read-only view.",
        "Inactive accounts with posted history are retained; zero-account visibility follows the selected filters."];
      if(branchId!==null || filter.accountId) warnings.push("Filtered branch/account view is not legal-group consolidation; its balances are not guaranteed to match a whole-book trial balance.");
      if(coverage.some(c=>c.exceptionCount>0)) warnings.push("Unposted, historical, stale or unclassified source exceptions remain; review the coverage register before relying on these figures.");
      return {...report,book:{id:bookId,name:book.name,currency:book.currency,policyVersion:book.policy_version,cutoverDate:book.policy.cutoverDate},
        branches,scope:branchId===null ? "whole_book" as const : "branch" as const,asOf:filter.to,generatedAt:new Date().toISOString(),warnings,coverage,
        sourceCompletenessConfirmed:false,limit:50000,truncated:false};
    },true);
  }
  async reportJournal(bookId:number,branchId:number|null,actorId:number,journalId:number) {
    requireAccounting(Number.isSafeInteger(journalId) && journalId>0,"INVALID_FILTER","Valid journal ID required");
    return this.transaction(bookId,async client=>{
      const {branches}=await this.reportingScope(client,bookId,branchId,actorId);
      const journal=(await client.query(`SELECT id,branch_id AS "branchId",accounting_date::text date,event_key AS "eventKey",kind,narration,evidence,
        reversal_of AS "reversalOf",posted_at AS "postedAt",prepared_by AS "preparedBy",posted_by AS "postedBy"
        FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=ANY($3::int[]) AND status='posted'`,[journalId,bookId,branches.map(b=>b.id)])).rows[0];
      requireAccounting(journal,"NOT_FOUND","Posted journal not found in this scope");
      const lines=(await client.query(`SELECT a.code,a.name,l.memo,l.debit_minor::text debit,l.credit_minor::text credit FROM accounting_journal_lines l
        JOIN accounting_accounts a ON a.id=l.account_id AND a.book_id=l.book_id WHERE l.journal_id=$1 AND l.book_id=$2 ORDER BY l.id`,[journalId,bookId])).rows;
      return {...journal,lines:lines.map(l=>({...l,debit:minorToMoney(l.debit),credit:minorToMoney(l.credit)}))};
    },true);
  }
  async approveAndPost(bookId: number, branchId: number, actorId: number, journalId: number, reason: string) {
    return this.transaction(bookId, async client => {
      await this.permission(client, bookId, branchId, actorId, "post");
      const journal = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3 FOR UPDATE",
        [journalId, bookId, branchId])).rows[0];
      requireAccounting(journal && journal.prepared_by !== actorId, "SELF_APPROVAL", "A different authorised approver is required");
      if (journal.status === "posted") return journal;
      requireAccounting(journal.status === "draft", "JOURNAL_STATE", "Only draft journals can be posted");
      if (journal.event_key.startsWith("source:")) {
        const evidence = (await client.query("SELECT evidence FROM accounting_journals WHERE id=$1", [journalId])).rows[0];
        const saved = JSON.parse(evidence.evidence);
        const current = saved.source.kind === "invoice"
          ? await this.invoiceDraft(client, bookId, branchId, actorId, saved.source.id, saved.mapping, "read")
          : OPERATIONAL_SOURCE_KINDS.includes(saved.source.kind)
            ? await this.operationalDraft(client,bookId,branchId,actorId,saved.source,saved.mapping,"read")
            : await this.settlementDraft(client, bookId, branchId, actorId, saved.source, saved.mapping, "read");
        requireAccounting(journalHash(normalizeJournal(current.input)) === journal.payload_hash,
          "SOURCE_CHANGED", "Source or mapping changed after preparation; do not post stale evidence");
      }
      if(journal.event_key.startsWith("opening:")) {
        const saved=JSON.parse((await client.query("SELECT evidence FROM accounting_journals WHERE id=$1",[journalId])).rows[0].evidence);
        const current=await this.openingDraft(client,actorId,saved.review,"read");
        requireAccounting(journalHash(normalizeJournal(current.input))===journal.payload_hash,"SOURCE_CHANGED","Opening review changed after preparation");
      }
      await this.audit(client, bookId, actorId, "posted", reason, branchId, journalId);
      return (await client.query<JournalRow>("UPDATE accounting_journals SET status='posted',posted_by=$2,posted_at=now() WHERE id=$1 RETURNING *", [journalId, actorId])).rows[0]!;
    });
  }
  async cancelDraft(bookId: number, branchId: number, actorId: number, journalId: number, reason: string) {
    return this.transaction(bookId, async client => {
      await this.permission(client, bookId, branchId, actorId, "prepare");
      const journal = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3 FOR UPDATE",
        [journalId, bookId, branchId])).rows[0];
      requireAccounting(journal?.status === "draft", "JOURNAL_STATE", "Only a draft can be cancelled");
      if (journal.prepared_by !== actorId) await this.permission(client, bookId, branchId, actorId, "configure");
      await client.query("UPDATE accounting_journals SET status='cancelled' WHERE id=$1", [journalId]);
      await this.audit(client, bookId, actorId, "cancelled", reason, branchId, journalId);
    });
  }
  async prepareReversal(bookId: number, branchId: number, actorId: number, originalId: number, date: string, reason: string) {
    accountingDate(date);
    return this.transaction(bookId, async client => {
      await this.permission(client, bookId, branchId, actorId, "reverse");
      const original = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3 AND status='posted' AND kind='manual'",
        [originalId, bookId, branchId])).rows[0];
      requireAccounting(original, "INVALID_REVERSAL", "Posted original in this book/branch required");
      requireAccounting(!original.event_key.startsWith("source:"), "SOURCE_REVIEW_REQUIRED", "Source settlements require a matching operational reversal, not an unrelated manual offset");
      const active = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE reversal_of=$1 AND status<>'cancelled'", [originalId])).rows[0];
      const attempts = (await client.query("SELECT count(*)::int n FROM accounting_journals WHERE reversal_of=$1", [originalId])).rows[0]!.n as number;
      // A cancelled attempt remains immutable; a corrected draft gets a new event link.
      const eventKey = active?.event_key ?? (attempts === 0 ? `reversal:${originalId}` : `reversal:${originalId}:retry:${attempts}`);
      const lines = (await client.query("SELECT * FROM accounting_journal_lines WHERE journal_id=$1 ORDER BY id", [originalId])).rows;
      return this.prepare(client, actorId, { bookId, branchId, currency: original.currency, accountingDate: date,
        eventKey, narration: `Reversal of journal ${originalId}`, evidence: reason,
        lines: lines.map(l => ({ accountId: l.account_id, debit: minorToMoney(l.credit_minor), credit: minorToMoney(l.debit_minor), memo: l.memo })) }, originalId);
    });
  }
  async changePeriod(bookId: number, actorId: number, periodId: number, action: "close" | "reopen", review: {
    evidence: string; sourceCoverageComplete: boolean; reconciled: boolean; unresolvedMappings: number;
  }) {
    requireAccounting(action === "close" || action === "reopen", "INVALID_PERIOD", "Close or reopen required");
    return this.transaction(bookId, async client => {
      // Closing a book affects all of its branches, not merely the selected UI branch.
      await this.bookPermission(client, bookId, actorId, action);
      const period = (await client.query("SELECT * FROM accounting_periods WHERE id=$1 AND book_id=$2 FOR UPDATE", [periodId, bookId])).rows[0];
      requireAccounting(period && period.status === (action === "close" ? "open" : "closed"), "PERIOD_STATE", "Period is not in the required state");
      if (action === "close") {
        requireAccounting(review.sourceCoverageComplete === true && review.reconciled === true && review.unresolvedMappings === 0,
          "CLOSE_REVIEW_REQUIRED", "Documented source completeness, reconciliation and zero unresolved mappings required");
        const count = (await client.query("SELECT count(*)::int n FROM accounting_journals WHERE period_id=$1 AND status='draft'", [periodId])).rows[0]?.n;
        requireAccounting(count === 0, "DRAFTS_PENDING", "Unposted drafts prevent closing");
      }
      await this.audit(client, bookId, actorId, action === "close" ? "period_closed" : "period_reopened",
        JSON.stringify(review), null, null, periodId);
      requireAccounting(typeof review.evidence === "string" && review.evidence.trim().length > 0, "EVIDENCE_REQUIRED", "Close/reopen evidence is required");
      await client.query("UPDATE accounting_periods SET status=$2 WHERE id=$1", [periodId, action === "close" ? "closed" : "open"]);
    });
  }
  async readJournal(bookId: number, branchId: number, actorId: number, journalId: number) {
    return this.transaction(bookId, async client => {
      await this.permission(client, bookId, branchId, actorId, "read");
      const journal = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3", [journalId, bookId, branchId])).rows[0];
      requireAccounting(journal, "NOT_FOUND", "Journal not found in this scope");
      const lines = (await client.query<{ account_id: number; debit_minor: string; credit_minor: string; memo: string }>("SELECT account_id,debit_minor::text,credit_minor::text,memo FROM accounting_journal_lines WHERE journal_id=$1 ORDER BY id", [journalId])).rows;
      return { ...journal, lines: lines.map(l => ({ accountId: l.account_id, debit: minorToMoney(l.debit_minor), credit: minorToMoney(l.credit_minor), memo: l.memo })) };
    });
  }
}
