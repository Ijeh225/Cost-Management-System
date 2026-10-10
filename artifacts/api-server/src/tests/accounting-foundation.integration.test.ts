import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { ensureAccountingFoundationSchema } from "../lib/accounting-schema";
import { NativeAccounting } from "../lib/native-accounting";
import { ACCOUNTING_POLICY_KEYS, type JournalInput } from "../lib/accounting-rules";

const schema = `acct_foundation_${Date.now()}_${randomBytes(4).toString("hex")}`;
const previousEnabled = process.env.NATIVE_ACCOUNTING_ENABLED;
const database = { connect: async () => {
  const client = await pool.connect();
  await client.query(`SET search_path TO "${schema}",public`);
  return client;
} };
const service = new NativeAccounting(database as Pick<typeof pool, "connect">);
async function sql(text: string, values: unknown[] = []) {
  const client = await database.connect();
  try { return await client.query(text, values); } finally { client.release(); }
}
const baselineSql = `SELECT jsonb_build_object('invoicePayments',(SELECT count(*) FROM public.invoice_payments),
  'deposits',(SELECT coalesce(sum(amount),0) FROM public.client_deposits),
  'payments',(SELECT coalesce(sum(amount),0) FROM public.payment_schedule_payments)) baseline`;
let baseline: unknown;
beforeAll(async () => {
  expect((await pool.query("SELECT current_database() name")).rows[0].name).toBe("cost_management_integration_test");
  baseline = (await pool.query(baselineSql)).rows[0].baseline;
  process.env.NATIVE_ACCOUNTING_ENABLED = "true";
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await sql(`CREATE TABLE branches(id SERIAL PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE users(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL REFERENCES branches(id),name TEXT,
    authority_level TEXT,job_function TEXT,workspace_access TEXT,access_profile_migrated_at TIMESTAMPTZ,is_active BOOLEAN NOT NULL DEFAULT true)`);
  await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
});
afterAll(async () => {
  try {
    expect((await pool.query(baselineSql)).rows[0].baseline).toEqual(baseline);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query("SET search_path TO public");
    if (previousEnabled === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
    else process.env.NATIVE_ACCOUNTING_ENABLED = previousEnabled;
  }
});
const policy = Object.fromEntries(ACCOUNTING_POLICY_KEYS.map(k => [k, k === "cutoverDate" ? "2026-10-01" : k === "financialYearEnd" ? "12-31" : `Isolated reviewed ${k}; not production approval`]));
async function fixture(approved = true) {
  const branch = (await sql("INSERT INTO branches(name) VALUES('Isolated native book branch') RETURNING id")).rows[0].id as number;
  const actors = (await sql(`INSERT INTO users(branch_id,name,authority_level,job_function,workspace_access,access_profile_migrated_at)
    VALUES($1,'Owner','super_admin','general_staff','[]',now()),($1,'Preparer','staff','accounts','["accounts"]',now()),
      ($1,'Approver','staff','accounts','["accounts"]',now()),($1,'Operations','staff','operations','["shipping"]',now()) RETURNING id`, [branch])).rows;
  const [owner, preparer, approver, operations] = actors.map(a => Number(a.id));
  const book = await service.createDraftBook(owner!, "Isolated reviewed draft", "NGN", [branch]);
  await sql(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by)
    SELECT $1,$2,$3,p,'Isolated owner-approved permission fixture',$3 FROM unnest(ARRAY['read','configure','prepare','post','reverse','close','reopen']) p`, [book, branch, owner]);
  for (const [user, permissions] of [[preparer, ["read", "prepare", "reverse"]], [approver, ["read", "post"]]] as const) {
    await sql(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by)
      SELECT $1,$2,$3,p,'Isolated approved grant',$4 FROM unnest($5::text[]) p`, [book, branch, user, owner, permissions]);
  }
  const debit = await service.addAccount(book, branch, owner!, "1000", "Isolated cash", "asset");
  const credit = await service.addAccount(book, branch, owner!, "2100", "Isolated deposit liability", "liability");
  const period = await service.createPeriod(book, branch, owner!, "October", "2026-10-01", "2026-10-31");
  if (approved) await service.approveBook(book, branch, owner!, { policy, version: "isolated-only-v1", ownerEvidence: "Dummy owner approval", accountantEvidence: "Dummy professional review; TEST ONLY" });
  return { book, branch, owner: owner!, preparer: preparer!, approver: approver!, operations: operations!, debit, credit, period };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function input(f: Fixture, key = randomBytes(8).toString("hex"), amount = "0.30"): JournalInput {
  return { bookId: f.book, branchId: f.branch, currency: "NGN", accountingDate: "2026-10-10", eventKey: `manual:qa:${key}`,
    narration: "Isolated controlled journal", evidence: "Dummy voucher; no cash/source mutation", lines: [
      { accountId: f.debit, debit: amount, credit: "0" }, { accountId: f.credit, debit: "0", credit: amount },
    ] };
}
const review = { evidence: "Isolated empty-source book reconciled; no production attestation", sourceCoverageComplete: true, reconciled: true, unresolvedMappings: 0 };
async function posted(f: Fixture) {
  const journal = await service.prepareJournal(f.preparer, input(f));
  return service.approveAndPost(f.book, f.branch, f.approver, journal.id, "Independent dummy voucher approval");
}
describe("Step6A-6F inactive native accounting foundation", () => {
  it("6B repeats migration without seeding accounts/books or changing source facts", async () => {
    const before = (await sql("SELECT count(*)::int n FROM accounting_books")).rows[0].n;
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    expect((await sql("SELECT count(*)::int n FROM accounting_books")).rows[0].n).toBe(before);
    expect((await pool.query(baselineSql)).rows[0].baseline).toEqual(baseline);
  });
  it("6B rolls back the entire migration when an incompatible parent schema fails", async () => {
    const broken = `${schema}_broken`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${broken}"; SET search_path TO "${broken}"; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE branches(id INTEGER PRIMARY KEY)`);
      await expect(ensureAccountingFoundationSchema({ connect: async () => ({ ...client, query: client.query.bind(client), release: () => {} }) } as Pick<typeof pool, "connect">)).rejects.toThrow();
      expect((await client.query("SELECT to_regclass('accounting_books') name")).rows[0].name).toBeNull();
    } finally { await client.query(`SET search_path TO public; DROP SCHEMA IF EXISTS "${broken}" CASCADE`); client.release(); }
  });
  it("6A requires complete approval evidence, and unapproved books cannot accept journals", async () => {
    const f = await fixture(false);
    await expect(service.approveBook(f.book, f.branch, f.owner, { policy: {}, version: "v1", ownerEvidence: "test", accountantEvidence: "test" })).rejects.toThrow();
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    await expect(sql("UPDATE accounting_books SET status='approved' WHERE id=$1", [f.book])).rejects.toThrow();
  });
  it("6C remains disabled regardless of an approved book or Super Admin authority", async () => {
    const f = await fixture(); delete process.env.NATIVE_ACCOUNTING_ENABLED;
    try { await expect(service.prepareJournal(f.owner, input(f))).rejects.toMatchObject({ code: "ACCOUNTING_DISABLED" }); }
    finally { process.env.NATIVE_ACCOUNTING_ENABLED = "true"; }
  });
  it("6C preserves exact large decimals and stable balanced lines", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f, "large", "9999999999999999.99"));
    await service.approveAndPost(f.book, f.branch, f.approver, j.id, "Reviewed exact amount");
    const read = await service.readJournal(f.book, f.branch, f.preparer, j.id);
    expect(read.lines.map(l => [l.debit, l.credit])).toEqual([["9999999999999999.99", "0.00"], ["0.00", "9999999999999999.99"]]);
  });
  it("6C serializes concurrent same-event requests and approvals without duplicate journals or events", async () => {
    const f = await fixture(); const request = input(f, "same-event");
    const journals = await Promise.all(Array.from({ length: 6 }, () => service.prepareJournal(f.preparer, request)));
    expect(new Set(journals.map(j => j.id)).size).toBe(1);
    const id = journals[0]!.id;
    await Promise.all(Array.from({ length: 4 }, () => service.approveAndPost(f.book, f.branch, f.approver, id, "Same reviewed approval")));
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'", [id])).rows[0].n).toBe(1);
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE journal_id=$1", [id])).rows[0].n).toBe(1);
  });
  it("6C refuses conflicting retries rather than replacing or double-counting the first payload", async () => {
    const f = await fixture(); const request = input(f, "conflict"); await service.prepareJournal(f.preparer, request);
    await expect(service.prepareJournal(f.preparer, { ...request, narration: "Different adjustment" })).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6C refuses inactive accounts at final approval, with approval audit fully rolled back", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    await sql("UPDATE accounting_accounts SET active=false WHERE id=$1", [f.debit]);
    await expect(service.approveAndPost(f.book, f.branch, f.approver, j.id, "Controlled inactive-account check")).rejects.toThrow("Inactive account");
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'", [j.id])).rows[0].n).toBe(0);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("draft");
  });
  it("6C rolls header, lines, event and audit back if the audit write fails", async () => {
    const f = await fixture();
    await sql(`CREATE FUNCTION fail_accounting_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='prepared' THEN RAISE EXCEPTION 'Controlled audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_accounting_audit BEFORE INSERT ON accounting_audit FOR EACH ROW EXECUTE FUNCTION fail_accounting_audit()`);
    try {
      await expect(service.prepareJournal(f.preparer, input(f, "rollback"))).rejects.toThrow("Controlled audit failure");
      expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
      expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
      expect((await sql("SELECT count(*)::int n FROM accounting_journal_lines WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
    } finally { await sql("DROP TRIGGER fail_accounting_audit ON accounting_audit; DROP FUNCTION fail_accounting_audit()"); }
  });
  it("6C rejects direct-SQL unbalanced posting at commit and keeps the journal draft", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE accounting_journal_lines SET debit_minor=31 WHERE journal_id=$1 AND debit_minor>0", [j.id]);
      await client.query("INSERT INTO accounting_audit(book_id,branch_id,actor_id,journal_id,action,reason) VALUES($1,$2,$3,$4,'posted','Dummy approval')", [f.book, f.branch, f.approver, j.id]);
      await client.query("UPDATE accounting_journals SET status='posted',posted_by=$2,posted_at=now() WHERE id=$1", [j.id, f.approver]);
      await expect(client.query("COMMIT")).rejects.toThrow("balance");
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("draft");
    expect((await sql("SELECT debit_minor::text FROM accounting_journal_lines WHERE journal_id=$1 AND debit_minor>0", [j.id])).rows[0].debit_minor).toBe("30");
  });
  it("6C forbids posted header/line/link/audit/account edits and deletion", async () => {
    const f = await fixture(); const j = await posted(f);
    for (const statement of ["UPDATE accounting_journals SET narration='Tampered' WHERE id=$1", "DELETE FROM accounting_journals WHERE id=$1",
      "UPDATE accounting_journal_lines SET debit_minor=31 WHERE journal_id=$1 AND debit_minor>0", "DELETE FROM accounting_journal_lines WHERE journal_id=$1",
      "DELETE FROM accounting_source_events WHERE journal_id=$1", "UPDATE accounting_audit SET reason='Tampered' WHERE journal_id=$1"])
      await expect(sql(statement, [j.id])).rejects.toThrow("immutable");
    await expect(sql("UPDATE accounting_accounts SET category='income' WHERE id=$1", [f.debit])).rejects.toThrow("immutable");
    await expect(sql("UPDATE accounting_books SET policy_version='Tampered' WHERE id=$1", [f.book])).rejects.toThrow("immutable");
  });
  it("6C reversal exactly offsets accounts, links evidence and keeps the original immutable", async () => {
    const f = await fixture(); const original = await posted(f);
    const reversal = await service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-11", "Wrong controlled adjustment; reviewed reversal");
    await service.approveAndPost(f.book, f.branch, f.approver, reversal.id, "Independent reversal approval");
    expect((await sql(`SELECT sum(l.debit_minor)-sum(l.credit_minor) balance FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.id=l.journal_id WHERE j.book_id=$1 GROUP BY account_id`, [f.book])).rows.every(r => r.balance === "0")).toBe(true);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [original.id])).rows[0].status).toBe("posted");
    await expect(service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-12", "Conflicting duplicate reversal")).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6D rejects overlap, invalid dates, wrong currency, pre-cutover and foreign-book accounts", async () => {
    const f = await fixture(); const other = await fixture();
    await expect(service.createPeriod(f.book, f.branch, f.owner, "Overlap", "2026-10-31", "2026-11-30")).rejects.toThrow("overlap");
    await expect(service.prepareJournal(f.preparer, { ...input(f), currency: "USD" })).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    await expect(service.prepareJournal(f.preparer, { ...input(f), accountingDate: "2026-09-30" })).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    const request = input(f); request.lines[0]!.accountId = other.debit;
    await expect(service.prepareJournal(f.preparer, request)).rejects.toMatchObject({ code: "INVALID_ACCOUNT" });
  });
  it("6C replaces a cancelled reversal without losing its audit or duplicating the posted offset", async () => {
    const f = await fixture(); const original = await posted(f);
    const first = await service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-11", "Dummy reversal awaiting correction");
    await service.cancelDraft(f.book, f.branch, f.preparer, first.id, "Wrong dummy reversal date; keep cancelled evidence");
    await sql("CREATE UNIQUE INDEX accounting_one_reversal ON accounting_journals(reversal_of) WHERE reversal_of IS NOT NULL");
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    const replacements = await Promise.all([1, 2].map(() => service.prepareReversal(f.book, f.branch, f.preparer,
      original.id, "2026-10-12", "Reviewed corrected dummy reversal")));
    expect(replacements[0]!.id).not.toBe(first.id);
    expect(replacements[0]!.id).toBe(replacements[1]!.id);
    await service.approveAndPost(f.book, f.branch, f.approver, replacements[0]!.id, "Independent corrected reversal approval");
    expect((await sql(`SELECT sum(l.debit_minor)-sum(l.credit_minor) balance FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.id=l.journal_id WHERE j.book_id=$1 AND j.status='posted' GROUP BY account_id`, [f.book])).rows.every(r => r.balance === "0")).toBe(true);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [first.id])).rows[0].status).toBe("cancelled");
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1", [f.book])).rows[0].n).toBe(3);
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='cancelled'", [first.id])).rows[0].n).toBe(1);
    await expect(sql("UPDATE accounting_journals SET status='draft' WHERE id=$1", [first.id])).rejects.toThrow("immutable");
    await expect(service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-13", "Another conflicting reversal")).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6D refuses close without source/reconciliation evidence or with pending drafts", async () => {
    const f = await fixture();
    await expect(service.changePeriod(f.book, f.owner, f.period, "close", { ...review, sourceCoverageComplete: false })).rejects.toMatchObject({ code: "CLOSE_REVIEW_REQUIRED" });
    const j = await service.prepareJournal(f.preparer, input(f));
    await expect(service.changePeriod(f.book, f.owner, f.period, "close", review)).rejects.toMatchObject({ code: "DRAFTS_PENDING" });
    await service.cancelDraft(f.book, f.branch, f.preparer, j.id, "Controlled cancelled draft");
    await service.changePeriod(f.book, f.owner, f.period, "close", review);
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });
  it("6D requires current audit and permission for direct-SQL close/reopen", async () => {
    const f = await fixture();
    await expect(sql("UPDATE accounting_periods SET status='closed' WHERE id=$1", [f.period])).rejects.toThrow("Audited");
    await service.changePeriod(f.book, f.owner, f.period, "close", review);
    await expect(service.changePeriod(f.book, f.approver, f.period, "reopen", review)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.changePeriod(f.book, f.owner, f.period, "reopen", { ...review, evidence: "Owner-authorised audited correction window" });
    expect((await sql("SELECT status FROM accounting_periods WHERE id=$1", [f.period])).rows[0].status).toBe("open");
  });
  it("6D serializes prepare against close: never creates a draft in a closed period", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([service.prepareJournal(f.preparer, input(f)), service.changePeriod(f.book, f.owner, f.period, "close", review)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await sql(`SELECT count(*)::int n FROM accounting_journals j JOIN accounting_periods p ON p.id=j.period_id
      WHERE j.book_id=$1 AND p.status='closed' AND j.status='draft'`, [f.book])).rows[0].n).toBe(0);
  });
  it("6D serializes post against close: close cannot pass before a pending journal posts", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    const results = await Promise.allSettled([service.approveAndPost(f.book, f.branch, f.approver, j.id, "Independent approval"),
      service.changePeriod(f.book, f.owner, f.period, "close", review)]);
    expect(results[0].status).toBe("fulfilled");
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("posted");
    if (results[1].status === "rejected") await service.changePeriod(f.book, f.owner, f.period, "close", review);
    expect((await sql("SELECT status FROM accounting_periods WHERE id=$1", [f.period])).rows[0].status).toBe("closed");
  });
  it("6E rejects self approval even for Super Admin and refuses generic finance/operations access", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.owner, input(f));
    await expect(service.approveAndPost(f.book, f.branch, f.owner, j.id, "Owner self-approval attempt")).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    await expect(service.prepareJournal(f.approver, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.prepareJournal(f.operations, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("6E honours grants/revocations, rejects disabled/invalid users and preserves branch isolation", async () => {
    const f = await fixture();
    await service.grantAccess(f.book, f.branch, f.owner, f.operations, "prepare", "Explicit isolated owner approval for this preparer");
    const j = await service.prepareJournal(f.operations, input(f)); expect(j.prepared_by).toBe(f.operations);
    await service.revokeAccess(f.book, f.branch, f.owner, f.operations, "prepare", "Revoked after controlled permission test");
    const accessAudit = (await sql("SELECT action,reason FROM accounting_audit WHERE book_id=$1 AND action IN ('access_granted','access_revoked') ORDER BY id", [f.book])).rows;
    expect(accessAudit.map(a => ({ action: a.action, ...JSON.parse(a.reason) }))).toEqual([
      { action: "access_granted", targetUserId: f.operations, permission: "prepare", evidence: "Explicit isolated owner approval for this preparer" },
      { action: "access_revoked", targetUserId: f.operations, permission: "prepare", reason: "Revoked after controlled permission test" },
    ]);
    await expect(service.prepareJournal(f.operations, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET is_active=false WHERE id=$1", [f.preparer]);
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET workspace_access='invalid' WHERE id=$1", [f.approver]);
    await expect(service.approveAndPost(f.book, f.branch, f.approver, j.id, "Invalid profile")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await fixture();
    await expect(service.readJournal(f.book, f.branch, other.preparer, j.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.grantAccess(f.book, f.branch, f.owner, other.preparer, "read", "Invalid branch grant attempt")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("6E also denies invalid specialist profiles at the database permission boundary", async () => {
    const f = await fixture();
    await sql("UPDATE users SET workspace_access='[]' WHERE id=$1", [f.preparer]);
    expect((await sql("SELECT accounting_has_grant($1,$2,$3,'prepare') allowed", [f.book, f.branch, f.preparer])).rows[0].allowed).toBe(false);
    await sql(`UPDATE users SET workspace_access='["accounts","accounts"]' WHERE id=$1`, [f.preparer]);
    expect((await sql("SELECT accounting_has_grant($1,$2,$3,'prepare') allowed", [f.book, f.branch, f.preparer])).rows[0].allowed).toBe(true);
    expect((await service.prepareJournal(f.preparer, input(f))).prepared_by).toBe(f.preparer);
    const other = await fixture();
    await expect(sql(`INSERT INTO accounting_audit(book_id,branch_id,actor_id,period_id,action,reason)
      VALUES($1,$2,$3,$4,'bad_link','Controlled cross-book audit attempt')`, [f.book, f.branch, f.owner, other.period])).rejects.toThrow();
  });
  it("6E audits cancellation of an abandoned draft without forcing a wrong posting", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    await expect(service.cancelDraft(f.book, f.branch, f.approver, j.id, "No prepare/configure grant")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET is_active=false WHERE id=$1", [f.preparer]);
    await service.cancelDraft(f.book, f.branch, f.owner, j.id, "Abandoned dummy draft; owner has explicit prepare/configure grants");
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("cancelled");
    expect((await sql("SELECT actor_id FROM accounting_audit WHERE journal_id=$1 AND action='cancelled'", [j.id])).rows[0].actor_id).toBe(f.owner);
    const second = await service.prepareJournal(f.owner, input(f));
    await expect(sql("UPDATE accounting_journals SET status='cancelled' WHERE id=$1", [second.id])).rejects.toThrow("cancellation requires");
  });
  it("6E requires all-branch configuration for a shared book chart and calendar", async () => {
    const f = await fixture();
    const second = (await sql("INSERT INTO branches(name) VALUES('Second isolated legal-book branch') RETURNING id")).rows[0].id;
    await sql("INSERT INTO accounting_book_branches VALUES($1,$2)", [f.book, second]);
    await expect(service.addAccount(f.book, f.branch, f.owner, "6000", "Shared overhead", "expense")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.createPeriod(f.book, f.branch, f.owner, "November", "2026-11-01", "2026-11-30")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.grantAccess(f.book, second, f.owner, f.owner, "configure", "Explicit shared-book calendar/chart responsibility");
    expect(await service.addAccount(f.book, f.branch, f.owner, "6000", "Shared overhead", "expense")).toBeGreaterThan(0);
    expect(await service.createPeriod(f.book, f.branch, f.owner, "November", "2026-11-01", "2026-11-30")).toBeGreaterThan(0);
  });
});
