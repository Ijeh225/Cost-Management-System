import type { pool } from "@workspace/db";
import { resolveAccessProfile } from "./authorization.js";
import { ACCOUNTING_PERMISSIONS, accountingDate, journalHash, minorToMoney, normalizeJournal,
  requireAccounting, requireAccountingEnabled, validatePolicy, moneyToMinor, type AccountingPermission, type JournalInput } from "./accounting-rules.js";
import { financialDateKey } from "./financial-reporting.js";
import { isInvoiceFinanciallyActive } from "./invoice-status.js";
import { buildSettlementJournal, settlementEventKey, type AccountingSettlementRef, type SettlementMapping, type SettlementSource } from "./accounting-source-mapping.js";

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

  private async transaction<T>(bookId: number | null, action: (client: Client) => Promise<T>): Promise<T> {
    requireAccountingEnabled();
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
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
  private async settlementDraft(client: Client, bookId: number, branchId: number, actorId: number,
    ref: AccountingSettlementRef, mapping: SettlementMapping, permission: "read" | "prepare") {
    settlementEventKey(ref);
    await this.permission(client, bookId, branchId, actorId, permission);
    const book = (await client.query("SELECT * FROM accounting_books WHERE id=$1", [bookId])).rows[0];
    requireAccounting(book?.status === "approved" && book.policy_version === mapping.policyVersion && book.currency === mapping.currency,
      "BOOK_NOT_APPROVED", "Matching approved book currency and policy version required");
    let source: SettlementSource;
    if (ref.kind === "client_deposit") {
      const row = (await client.query(`SELECT d.*,c.branch_id client_branch FROM client_deposits d
        JOIN clients c ON c.id=d.client_id WHERE d.id=$1 AND d.branch_id=$2 FOR SHARE OF d,c`, [ref.id, branchId])).rows[0];
      requireAccounting(row && row.client_branch === branchId, "NOT_FOUND", "Deposit not found in this branch");
      requireAccounting(!row.notes?.includes("[VOIDED by wallet reset"), "SOURCE_REVIEW_REQUIRED", "Voided deposit needs explicit historical review");
      source = { ...ref, branchId, clientId: row.client_id, amount: row.amount, bankId: row.bank_id,
        paymentMethod: row.payment_method, accountingDate: financialDateKey(new Date(row.created_at)) };
    } else {
      const row = (await client.query(`SELECT p.*,i.client_id,i.status invoice_status,i.branch_id invoice_branch,i.total invoice_total,i.written_off_amount
        FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
        WHERE p.id=$1 AND p.branch_id=$2 FOR SHARE OF p,i`, [ref.id, branchId])).rows[0];
      requireAccounting(row && row.invoice_branch === branchId, "NOT_FOUND", "Invoice settlement not found in this branch");
      requireAccounting(isInvoiceFinanciallyActive(row.invoice_status) && ["sent", "partial", "paid", "overdue"].includes(row.invoice_status),
        "SOURCE_REVIEW_REQUIRED", "Unknown/draft/cancelled/written-off invoice history needs its own reviewed treatment");
      const credits = (await client.query("SELECT id FROM credit_notes WHERE invoice_id=$1 AND status='active' FOR SHARE", [row.invoice_id])).rows;
      const prior = (await client.query(`SELECT coalesce(sum(amount),0)::text amount FROM invoice_payments
        WHERE invoice_id=$1 AND (paid_at,id)<=($2::timestamp,$3)`, [row.invoice_id, row.paid_at, row.id])).rows[0];
      requireAccounting(credits.length === 0 && (!row.written_off_amount || moneyToMinor(row.written_off_amount) === 0n)
        && moneyToMinor(prior.amount) <= moneyToMinor(row.invoice_total), "SOURCE_REVIEW_REQUIRED",
      "Credit-note, write-off and excess-collection history requires its own reviewed mapping");
      if (row.source_deposit_id !== null) {
        const deposit = (await client.query("SELECT * FROM client_deposits WHERE id=$1 FOR SHARE", [row.source_deposit_id])).rows[0];
        requireAccounting(deposit && deposit.branch_id === branchId && deposit.client_id === row.client_id
          && !deposit.notes?.includes("[VOIDED by wallet reset") && new Date(deposit.created_at) <= new Date(row.paid_at),
        "SOURCE_REVIEW_REQUIRED", "Matching non-voided, previously received client deposit required");
        const allocated = (await client.query(`SELECT coalesce(sum(amount),0)::text amount FROM invoice_payments
          WHERE source_deposit_id=$1 AND (paid_at,id)<=($2::timestamp,$3)`, [deposit.id, row.paid_at, row.id])).rows[0];
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
        const original = (await client.query("SELECT * FROM invoice_payments WHERE id=$1 FOR SHARE", [row.reversal_of_payment_id])).rows[0];
        requireAccounting(original && original.entry_type === "payment" && original.branch_id === branchId
          && original.invoice_id === row.invoice_id && original.amount === row.amount.slice(1)
          && original.bank_id === row.bank_id && original.source_deposit_id === row.source_deposit_id
          && original.payment_method === row.payment_method && new Date(original.paid_at) <= new Date(row.paid_at),
        "INVALID_REVERSAL", "Matching original settlement and full dated reversal required");
      }
      source = { ...ref, branchId, clientId: row.client_id, amount: row.amount, bankId: row.bank_id,
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
        const current = await this.settlementDraft(client, bookId, branchId, actorId, saved.source, saved.mapping, "read");
        requireAccounting(journalHash(normalizeJournal(current.input)) === journal.payload_hash,
          "SOURCE_CHANGED", "Source or mapping changed after preparation; do not post stale evidence");
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
