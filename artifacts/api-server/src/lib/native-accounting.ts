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
import { manualInput, mappedControlAccounts, type ManualAdjustment } from "./accounting-manual.js";
import { buildOpeningSetup, type OpeningSetupRequest, type OpeningAccount } from "./accounting-opening-setup.js";

type Database = Pick<typeof pool, "connect">;
async function connectClient(database: Database) { return database.connect(); }
type Client = Awaited<ReturnType<typeof connectClient>>;
interface JournalRow { id: number; book_id: number; branch_id: number; status: string; prepared_by: number;
  currency: string; kind: string; event_key: string; payload_hash: string; }
interface ActorRow { id: number; branch_id: number; authority_level: string; job_function: string;
  workspace_access: string; access_profile_migrated_at: Date | null; is_active: boolean; }
interface OpeningVersionRow {
  id:number; state:"pending"|"verified"|"rejected"|"cancelled"; preparedBy:number; reviewedBy:number|null; journalId:number|null;
  payload:ReturnType<typeof buildOpeningSetup>["payload"];
}

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
    branchId: number | null = null, journalId: number | null = null, periodId: number | null = null, openingId: number | null = null) {
    requireAccounting(typeof reason === "string" && reason.trim().length > 0 && reason.length <= 4000, "EVIDENCE_REQUIRED", "Audit evidence/reason is required");
    await client.query(`INSERT INTO accounting_audit(book_id,branch_id,actor_id,journal_id,period_id,action,reason,opening_setup_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [bookId, branchId, actorId, journalId, periodId, action, reason.trim(), openingId]);
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
    if(input.eventKey.startsWith("source:")) {
      const controls=mappedControlAccounts(JSON.parse(input.evidence).mapping);
      const unsafe=(await client.query("SELECT account_id FROM accounting_manual_account_rules WHERE book_id=$1 AND role='adjustment' AND account_id=ANY($2::int[])",[input.bookId,controls])).rows;
      requireAccounting(unsafe.length===0,"PROTECTED_ACCOUNT","A source control account cannot be classified for freehand adjustments");
    }
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
      await this.openingReady(client,input.bookId,input.branchId);
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
    requireAccounting(!/^(source|opening|adjustment):/.test(input.eventKey), "RESERVED_EVENT", "Source, opening and reviewed-adjustment identities require their dedicated workflow");
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
    return this.transaction(review.bookId,client=>this.prepareOpeningDraft(client,actorId,review));
  }
  private async prepareOpeningDraft(client:Client,actorId:number,review:ReviewedOpening) {
      const draft=await this.openingDraft(client,actorId,review,"prepare");
      const journal=await this.prepare(client,actorId,draft.input);
      requireAccounting(journal.status!=="cancelled","SOURCE_CANCELLED","Cancelled opening requires reviewed correction");
      return journal;
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
  async approveAndPost(bookId: number, branchId: number, actorId: number, journalId: number, reason: string, manualOnly=false) {
    return this.transaction(bookId, client => this.postJournal(client,bookId,branchId,actorId,journalId,reason,manualOnly));
  }
  private async postJournal(client:Client,bookId:number,branchId:number,actorId:number,journalId:number,reason:string,manualOnly=false) {
      await this.permission(client, bookId, branchId, actorId, "post");
      const journal = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3 FOR UPDATE",
        [journalId, bookId, branchId])).rows[0];
      requireAccounting(journal && journal.prepared_by !== actorId, "SELF_APPROVAL", "A different authorised approver is required");
      const workflow=(await client.query("SELECT state FROM accounting_manual_workflow WHERE journal_id=$1",[journalId])).rows[0];
      requireAccounting(!manualOnly || workflow,"NOT_FOUND","Manual workflow journal required");
      if (journal.status === "posted") return journal;
      requireAccounting(journal.status === "draft", "JOURNAL_STATE", "Only draft journals can be posted");
      if(!journal.event_key.startsWith("opening:")) await this.openingReady(client,bookId,branchId);
      if(workflow) {
        requireAccounting(workflow.state==="submitted","REVIEW_REQUIRED","Submit this exact version before independent approval/posting");
        await this.manualAccounts(client,bookId,journalId);
      }
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
  }
  async cancelDraft(bookId: number, branchId: number, actorId: number, journalId: number, reason: string) {
    return this.transaction(bookId, async client => {
      await this.permission(client, bookId, branchId, actorId, "prepare");
      const journal = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE id=$1 AND book_id=$2 AND branch_id=$3 FOR UPDATE",
        [journalId, bookId, branchId])).rows[0];
      requireAccounting(journal?.status === "draft", "JOURNAL_STATE", "Only a draft can be cancelled");
      const review=(await client.query("SELECT state FROM accounting_manual_workflow WHERE journal_id=$1",[journalId])).rows[0];
      requireAccounting(!review || ["draft","rejected"].includes(review.state),"JOURNAL_STATE","Submitted manual versions require independent review before cancellation");
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
      return this.reversalDraft(client,bookId,branchId,actorId,original,date,reason);
    });
  }
  private async reversalDraft(client:Client,bookId:number,branchId:number,actorId:number,original:JournalRow,date:string,reason:string) {
      const originalId=original.id;
      const active = (await client.query<JournalRow>("SELECT * FROM accounting_journals WHERE reversal_of=$1 AND status<>'cancelled'", [originalId])).rows[0];
      const attempts = (await client.query("SELECT count(*)::int n FROM accounting_journals WHERE reversal_of=$1", [originalId])).rows[0]!.n as number;
      // A cancelled attempt remains immutable; a corrected draft gets a new event link.
      const eventKey = active?.event_key ?? (attempts === 0 ? `reversal:${originalId}` : `reversal:${originalId}:retry:${attempts}`);
      const lines = (await client.query("SELECT * FROM accounting_journal_lines WHERE journal_id=$1 ORDER BY id", [originalId])).rows;
      return this.prepare(client, actorId, { bookId, branchId, currency: original.currency, accountingDate: date,
        eventKey, narration: `Reversal of journal ${originalId}`, evidence: reason,
        lines: lines.map(l => ({ accountId: l.account_id, debit: minorToMoney(l.credit_minor), credit: minorToMoney(l.debit_minor), memo: l.memo })) }, originalId);
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

  private async openingReady(client:Client,bookId:number,branchId:number) {
    requireAccounting((await client.query("SELECT id FROM accounting_opening_setup WHERE book_id=$1 AND branch_id=$2 AND state='verified'",[bookId,branchId])).rowCount,
      "OPENING_REQUIRED","Independently verify all opening balances before forward accounting transactions");
  }
  private async openingChart(client:Client,bookId:number):Promise<OpeningAccount[]> {
    return (await client.query<OpeningAccount>("SELECT id,code,name,category,active FROM accounting_accounts WHERE book_id=$1 ORDER BY id",[bookId])).rows;
  }
  private async openingSetupDraft(client:Client,bookId:number,branchId:number,actorId:number,request:OpeningSetupRequest) {
    const scope=await this.reportingScope(client,bookId,branchId,actorId);
    const draft=buildOpeningSetup(bookId,branchId,scope.book.currency,request,await this.openingChart(client,bookId));
    const book=(await client.query("SELECT policy_version FROM accounting_books WHERE id=$1",[bookId])).rows[0];
    requireAccounting(request.cutoverDate===scope.book.policy.cutoverDate && request.policyVersion===book.policy_version,
      "BOOK_NOT_APPROVED","Opening date and version must match the approved book, not today's date");
    requireAccounting((await client.query("SELECT id FROM accounting_periods WHERE book_id=$1 AND status='open' AND $2::date BETWEEN starts_on AND ends_on",[bookId,request.cutoverDate])).rowCount,
      "PERIOD_CLOSED","Opening date requires an open accounting period");
    if(draft.review) await this.openingDraft(client,actorId,draft.review,"read");
    else requireAccounting(!(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND status<>'cancelled' LIMIT 1",[bookId,branchId])).rowCount,
      "CUTOVER_CONFLICT","Zero initialisation cannot replace recorded financial entries");
    return draft;
  }
  async openingWorkspace(bookId:number,branchId:number,actorId:number) {
    return this.transaction(bookId,async client=>{
      const scope=await this.reportingScope(client,bookId,branchId,actorId);
      const version=(await client.query("SELECT policy_version FROM accounting_books WHERE id=$1",[bookId])).rows[0].policy_version;
      const permissions:string[]=[];
      for(const p of ["prepare","post"] as const)
        if((await client.query("SELECT accounting_has_grant($1,$2,$3,$4) allowed",[bookId,branchId,actorId,p])).rows[0]?.allowed) permissions.push(p);
      const versions=(await client.query(`SELECT id,state,prepared_by AS "preparedBy",reviewed_by AS "reviewedBy",journal_id AS "journalId",
        created_at AS "createdAt" FROM accounting_opening_setup WHERE book_id=$1 AND branch_id=$2 ORDER BY id DESC LIMIT 201`,[bookId,branchId])).rows;
      const ready=!!(await client.query("SELECT id FROM accounting_opening_setup WHERE book_id=$1 AND branch_id=$2 AND state='verified'",[bookId,branchId])).rowCount;
      return {book:{id:bookId,name:scope.book.name,currency:scope.book.currency,cutoverDate:scope.book.policy.cutoverDate,policyVersion:version},branchId,
        permissions,accounts:await this.openingChart(client,bookId),ready,versions:versions.slice(0,200),truncated:versions.length>200};
    },true);
  }
  async openingDetails(bookId:number,branchId:number,actorId:number,id:number) {
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      const row=(await client.query<OpeningVersionRow>(`SELECT id,state,prepared_by AS "preparedBy",reviewed_by AS "reviewedBy",journal_id AS "journalId",payload
        FROM accounting_opening_setup WHERE id=$1 AND book_id=$2 AND branch_id=$3`,[id,bookId,branchId])).rows[0];
      requireAccounting(row,"NOT_FOUND","Opening version not found in this scope");
      const audit=(await client.query<{actorId:number;action:string;reason:string;createdAt:Date}>(`SELECT actor_id AS "actorId",action,reason,created_at AS "createdAt" FROM accounting_audit
        WHERE opening_setup_id=$1 ORDER BY id`,[id])).rows;
      return {...row,audit};
    },true);
  }
  async previewOpeningSetup(bookId:number,branchId:number,actorId:number,request:OpeningSetupRequest) {
    return this.transaction(bookId,async client=>{
      const draft=await this.openingSetupDraft(client,bookId,branchId,actorId,request);
      return {debitTotal:draft.debitTotal,creditTotal:draft.creditTotal,zero:draft.zero,accountCount:draft.payload.chart.length};
    },true);
  }
  async prepareOpeningSetup(bookId:number,branchId:number,actorId:number,request:OpeningSetupRequest) {
    return this.transaction(bookId,async client=>{
      await this.permission(client,bookId,branchId,actorId,"prepare");
      await this.reportingScope(client,bookId,branchId,actorId);
      const existing=(await client.query("SELECT * FROM accounting_opening_setup WHERE book_id=$1 AND branch_id=$2 AND request_key=$3",[bookId,branchId,request.requestId])).rows[0];
      if(existing) {
        const saved=buildOpeningSetup(bookId,branchId,existing.payload.review?.currency??(await client.query("SELECT currency FROM accounting_books WHERE id=$1",[bookId])).rows[0].currency,
          request,existing.payload.chart);
        requireAccounting(existing.prepared_by===actorId && existing.payload_hash===saved.hash,"DUPLICATE_CONFLICT","Opening identity belongs to a different payload or preparer");
        return {id:existing.id};
      }
      requireAccounting(!(await client.query("SELECT id FROM accounting_opening_setup WHERE book_id=$1 AND branch_id=$2 AND state IN ('pending','verified')",[bookId,branchId])).rowCount,
        "OPENING_STATE","Review/cancel the pending version; verified openings cannot be overwritten");
      const draft=await this.openingSetupDraft(client,bookId,branchId,actorId,request);
      const journal=draft.review ? await this.prepareOpeningDraft(client,actorId,draft.review) : null;
      const row=(await client.query(`INSERT INTO accounting_opening_setup(book_id,branch_id,request_key,payload_hash,payload,prepared_by,journal_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[bookId,branchId,request.requestId,draft.hash,JSON.stringify(draft.payload),actorId,journal?.id??null])).rows[0];
      await this.audit(client,bookId,actorId,"opening_prepared",draft.zero ? "Explicit full-chart zero opening submitted; no journal created" : "Complete opening submitted for independent verification",branchId,journal?.id??null,null,row.id);
      return {id:row.id};
    });
  }
  async openingAction(bookId:number,branchId:number,actorId:number,id:number,action:"verify"|"reject"|"cancel",reason:string) {
    requireAccounting(["verify","reject","cancel"].includes(action),"INVALID_REQUEST","Valid opening action required");
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      await this.permission(client,bookId,branchId,actorId,action==="cancel" ? "prepare" : "post");
      const row=(await client.query("SELECT * FROM accounting_opening_setup WHERE id=$1 AND book_id=$2 AND branch_id=$3 FOR UPDATE",[id,bookId,branchId])).rows[0];
      requireAccounting(row,"NOT_FOUND","Opening version not found in this scope");
      requireAccounting(action==="cancel" ? row.prepared_by===actorId : row.prepared_by!==actorId,"SELF_APPROVAL","Original preparer cancellation or independent verification required");
      const state=action==="verify" ? "verified" : action==="reject" ? "rejected" : "cancelled";
      if(row.state===state) return {id};
      requireAccounting(row.state==="pending","OPENING_STATE","Only pending openings accept a decision");
      if(action==="verify") {
        const draft=await this.openingSetupDraft(client,bookId,branchId,actorId,row.payload.request);
        requireAccounting(draft.hash===row.payload_hash,"SOURCE_CHANGED","Chart or opening evidence changed; cancel/reject and prepare a reviewed replacement");
        if(row.journal_id) await this.postJournal(client,bookId,branchId,actorId,row.journal_id,reason);
      }
      await this.audit(client,bookId,actorId,`opening_${state}`,reason,branchId,row.journal_id,null,id);
      if(action!=="verify" && row.journal_id) {
        await this.audit(client,bookId,actorId,"cancelled",`Opening ${state}: ${reason}`,branchId,row.journal_id);
        requireAccounting((await client.query("UPDATE accounting_journals SET status='cancelled' WHERE id=$1 AND status='draft'",[row.journal_id])).rowCount,
          "OPENING_STATE","Posted opening journal cannot be rejected or cancelled");
      }
      await client.query("UPDATE accounting_opening_setup SET state=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1",[id,state,actorId]);
      return {id};
    });
  }

  private async manualAccounts(client:Client,bookId:number,journalId?:number,accountIds?:number[]) {
    const unreviewed=(await client.query(`SELECT a.id FROM accounting_accounts a LEFT JOIN accounting_manual_account_rules r
      ON r.book_id=a.book_id AND r.account_id=a.id WHERE a.book_id=$1 AND r.account_id IS NULL LIMIT 1`,[bookId])).rows;
    requireAccounting(unreviewed.length===0,"ACCOUNT_REVIEW_REQUIRED","Review the entire chart: bank, customer, supplier and tax controls are protected, never inferred from names");
    const ids=accountIds??(await client.query("SELECT account_id FROM accounting_journal_lines WHERE journal_id=$1",[journalId])).rows.map(l=>l.account_id);
    const approved=(await client.query(`SELECT a.id FROM accounting_accounts a JOIN accounting_manual_account_rules r ON r.account_id=a.id AND r.book_id=a.book_id
      JOIN accounting_books b ON b.id=a.book_id WHERE a.book_id=$1 AND a.active AND r.role='adjustment' AND r.policy_version=b.policy_version AND a.id=ANY($2::int[])`,[bookId,ids])).rows;
    requireAccounting(new Set(approved.map(a=>a.id)).size===new Set(ids).size,"PROTECTED_ACCOUNT","Only explicitly reviewed active non-control adjustment accounts may be used; use source workflows for control accounts");
  }
  async reviewManualAccounts(bookId:number,actorId:number,review:{ownerEvidence:string;accountantEvidence:string;accounts:{accountId:number;role:"adjustment"|"protected"}[]}) {
    return this.transaction(bookId,async client=>{
      await this.bookPermission(client,bookId,actorId,"configure");
      requireAccounting((await this.actor(client,actorId)).authority_level==="super_admin","FORBIDDEN","Owner and accountant review required");
      const book=(await client.query("SELECT status,policy_version FROM accounting_books WHERE id=$1",[bookId])).rows[0];
      requireAccounting(book?.status==="approved","BOOK_NOT_APPROVED","Approved book required");
      const accounts=(await client.query("SELECT id FROM accounting_accounts WHERE book_id=$1 ORDER BY id",[bookId])).rows;
      requireAccounting(review.accounts.length===accounts.length && new Set(review.accounts.map(a=>a.accountId)).size===accounts.length
        && accounts.every(a=>review.accounts.some(r=>r.accountId===a.id && ["adjustment","protected"].includes(r.role))),"ACCOUNT_REVIEW_REQUIRED","Explicit complete chart classification required");
      requireAccounting(typeof review.ownerEvidence==="string" && review.ownerEvidence.trim().length>0 && review.ownerEvidence.length<=1000
        && typeof review.accountantEvidence==="string" && review.accountantEvidence.trim().length>0 && review.accountantEvidence.length<=1000,"EVIDENCE_REQUIRED","Actual owner and accountant evidence required, not a default approval");
      const sources=(await client.query("SELECT evidence FROM accounting_journals WHERE book_id=$1 AND event_key LIKE 'source:%'",[bookId])).rows;
      const controls=new Set(sources.flatMap(s=>mappedControlAccounts(JSON.parse(s.evidence).mapping)));
      requireAccounting(review.accounts.every(a=>!controls.has(a.accountId) || a.role==="protected"),"PROTECTED_ACCOUNT","Known source control accounts must remain protected");
      const saved=(await client.query("SELECT account_id,role FROM accounting_manual_account_rules WHERE book_id=$1",[bookId])).rows;
      requireAccounting(saved.every(a=>review.accounts.some(r=>r.accountId===a.account_id && r.role===a.role)),"ACCOUNT_REVIEW_REQUIRED","Existing approved classifications cannot be silently changed");
      const evidence=JSON.stringify({ownerEvidence:review.ownerEvidence,accountantEvidence:review.accountantEvidence,accounts:review.accounts});
      await this.audit(client,bookId,actorId,"manual_accounts_reviewed",JSON.stringify({ownerEvidence:review.ownerEvidence,accountantEvidence:review.accountantEvidence}));
      for(const rule of review.accounts.filter(a=>!saved.some(s=>s.account_id===a.accountId)))
        await client.query("INSERT INTO accounting_manual_account_rules(book_id,account_id,role,policy_version,evidence,approved_by) VALUES($1,$2,$3,$4,$5,$6)",
          [bookId,rule.accountId,rule.role,book.policy_version,evidence.length<=4000 ? evidence : JSON.stringify({ownerEvidence:review.ownerEvidence,accountantEvidence:review.accountantEvidence}),actorId]);
      return {reviewed:true};
    });
  }
  async manualWorkspace(bookId:number,branchId:number,actorId:number) {
    return this.transaction(bookId,async client=>{
      const scope=await this.reportingScope(client,bookId,branchId,actorId);
      const permissions:string[]=[];
      for(const p of ["configure","prepare","post","reverse"] as const)
        if((await client.query("SELECT accounting_has_grant($1,$2,$3,$4) allowed",[bookId,branchId,actorId,p])).rows[0]?.allowed) permissions.push(p);
      const accounts=(await client.query(`SELECT a.id,a.code,a.name,a.category,a.active,r.role FROM accounting_accounts a
        LEFT JOIN accounting_manual_account_rules r ON r.account_id=a.id AND r.book_id=a.book_id WHERE a.book_id=$1 ORDER BY a.code`,[bookId])).rows;
      const journals=(await client.query(`SELECT j.id,j.accounting_date::text AS date,j.narration,j.prepared_by AS "preparedBy",j.posted_by AS "postedBy",j.reversal_of AS "reversalOf",
        CASE WHEN j.status='draft' THEN w.state ELSE j.status END AS state,w.replaces_journal_id AS "replacesJournalId",j.evidence
        FROM accounting_journals j JOIN accounting_manual_workflow w ON w.journal_id=j.id
        WHERE j.book_id=$1 AND j.branch_id=$2 ORDER BY j.id DESC LIMIT 201`,[bookId,branchId])).rows;
      return {book:{id:bookId,name:scope.book.name,currency:scope.book.currency,cutoverDate:scope.book.policy.cutoverDate},branchId,permissions,accounts,
        accountReviewComplete:accounts.length>0 && accounts.every(a=>a.role!==null),journals:journals.slice(0,200),truncated:journals.length>200};
    },true);
  }
  async manualDetails(bookId:number,branchId:number,actorId:number,journalId:number) {
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      const journal=(await client.query(`SELECT j.id,j.accounting_date::text AS date,j.narration,j.currency,j.evidence,j.prepared_by AS "preparedBy",j.posted_by AS "postedBy",
        j.reversal_of AS "reversalOf",CASE WHEN j.status='draft' THEN w.state ELSE j.status END AS state,w.replaces_journal_id AS "replacesJournalId"
        FROM accounting_journals j JOIN accounting_manual_workflow w ON w.journal_id=j.id WHERE j.id=$1 AND j.book_id=$2 AND j.branch_id=$3`,[journalId,bookId,branchId])).rows[0];
      requireAccounting(journal,"NOT_FOUND","Manual journal not found in this scope");
      const lines=(await client.query("SELECT account_id AS \"accountId\",debit_minor::text,credit_minor::text,memo FROM accounting_journal_lines WHERE journal_id=$1 ORDER BY id",[journalId])).rows;
      const audit=(await client.query("SELECT actor_id AS \"actorId\",action,reason,created_at AS \"createdAt\" FROM accounting_audit WHERE journal_id=$1 ORDER BY id",[journalId])).rows;
      return {...journal,lines:lines.map(l=>({accountId:l.accountId,debit:minorToMoney(l.debit_minor),credit:minorToMoney(l.credit_minor),memo:l.memo})),audit};
    },true);
  }
  async prepareManual(bookId:number,branchId:number,actorId:number,request:ManualAdjustment) {
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      const book=(await client.query("SELECT currency FROM accounting_books WHERE id=$1",[bookId])).rows[0];
      const input=manualInput(bookId,branchId,book.currency,request);
      await this.manualAccounts(client,bookId,undefined,request.lines.map(l=>l.accountId));
      const existing=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND event_key=$2",[bookId,input.eventKey])).rows[0];
      if(existing) return this.prepare(client,actorId,input);
      if(request.replacesJournalId) {
        const original=(await client.query(`SELECT j.status,j.prepared_by,j.kind,w.state FROM accounting_journals j JOIN accounting_manual_workflow w ON w.journal_id=j.id
          WHERE j.id=$1 AND j.book_id=$2 AND j.branch_id=$3 FOR UPDATE OF j,w`,[request.replacesJournalId,bookId,branchId])).rows[0];
        requireAccounting(original?.status==="draft" && original.kind==="manual" && ["draft","rejected"].includes(original.state) && original.prepared_by===actorId,"JOURNAL_STATE","Only your original draft/rejected version can be revised; reversals, submitted and posted versions cannot change");
        await this.permission(client,bookId,branchId,actorId,"prepare");
        await client.query("UPDATE accounting_journals SET status='cancelled' WHERE id=$1",[request.replacesJournalId]);
        await this.audit(client,bookId,actorId,"cancelled",`Superseded by reviewed request ${request.requestId}`,branchId,request.replacesJournalId);
      }
      const journal=await this.prepare(client,actorId,input);
      await client.query("INSERT INTO accounting_manual_workflow(journal_id,book_id,replaces_journal_id) VALUES($1,$2,$3)",[journal.id,bookId,request.replacesJournalId??null]);
      return journal;
    });
  }
  async manualAction(bookId:number,branchId:number,actorId:number,journalId:number,action:"submit"|"reject"|"post"|"cancel",reason:string) {
    requireAccounting(["submit","reject","post","cancel"].includes(action),"INVALID_REQUEST","Supported manual workflow action required");
    if(action==="post") return this.approveAndPost(bookId,branchId,actorId,journalId,reason,true);
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      await this.permission(client,bookId,branchId,actorId,action==="reject" ? "post" : "prepare");
      const journal=(await client.query(`SELECT j.*,w.state FROM accounting_journals j JOIN accounting_manual_workflow w ON w.journal_id=j.id
        WHERE j.id=$1 AND j.book_id=$2 AND j.branch_id=$3 FOR UPDATE OF j,w`,[journalId,bookId,branchId])).rows[0];
      requireAccounting(journal,"NOT_FOUND","Manual workflow required");
      requireAccounting(action==="reject" ? journal.prepared_by!==actorId : journal.prepared_by===actorId,"SELF_APPROVAL","Independent reviewer / original preparer required");
      if(action==="cancel" && journal.status==="cancelled" || action==="submit" && journal.status==="draft" && journal.state==="submitted"
        || action==="reject" && journal.status==="draft" && journal.state==="rejected") return {id:journalId};
      requireAccounting(journal.status==="draft" && (action==="reject" ? journal.state==="submitted" : ["draft","rejected"].includes(journal.state)),"JOURNAL_STATE","Journal is not in the required review state");
      if(action==="submit") {
        requireAccounting(journal.state==="draft","JOURNAL_STATE","Revise rejected journals into a new draft before submission");
        await this.manualAccounts(client,bookId,journalId);
      }
      await this.audit(client,bookId,actorId,action==="cancel" ? "cancelled" : action==="submit" ? "manual_submitted" : "manual_rejected",reason,branchId,journalId);
      if(action==="cancel") await client.query("UPDATE accounting_journals SET status='cancelled' WHERE id=$1",[journalId]);
      else await client.query("UPDATE accounting_manual_workflow SET state=$2 WHERE journal_id=$1",[journalId,action==="submit" ? "submitted" : "rejected"]);
      return {id:journalId};
    });
  }
  async prepareManualReversal(bookId:number,branchId:number,actorId:number,originalId:number,date:string,reason:string) {
    accountingDate(date);
    return this.transaction(bookId,async client=>{
      await this.reportingScope(client,bookId,branchId,actorId);
      await this.permission(client,bookId,branchId,actorId,"reverse");
      const original=(await client.query(`SELECT j.* FROM accounting_journals j JOIN accounting_manual_workflow w ON w.journal_id=j.id
        WHERE j.id=$1 AND j.book_id=$2 AND j.branch_id=$3 AND j.status='posted' AND j.kind='manual'`,[originalId,bookId,branchId])).rows[0];
      requireAccounting(original,"INVALID_REVERSAL","Only a posted original manual adjustment can be reversed here; source and opening entries use dedicated workflows");
      await this.manualAccounts(client,bookId,originalId);
      const journal=await this.reversalDraft(client,bookId,branchId,actorId,original,date,reason);
      if(!(await client.query("SELECT journal_id FROM accounting_manual_workflow WHERE journal_id=$1",[journal.id])).rowCount)
        await client.query("INSERT INTO accounting_manual_workflow(journal_id,book_id) VALUES($1,$2)",[journal.id,bookId]);
      return journal;
    });
  }
}
