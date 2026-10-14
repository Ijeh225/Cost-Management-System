import type { pool } from "@workspace/db";
import { WORKSPACES_ALLOWED_BY_FUNCTION } from "./access-policy.js";
import { ACCOUNTING_AFFAIRS_SQL } from "./accounting-affairs-schema.js";
import { ACCOUNTING_SOURCE_REVIEW_SQL } from "./accounting-source-review-schema.js";

const allowedWorkspaceSql = `CASE a.job_function ${Object.entries(WORKSPACES_ALLOWED_BY_FUNCTION)
  .map(([job, workspaces]) => `WHEN '${job}' THEN '${JSON.stringify(workspaces)}'::jsonb`).join(" ")} ELSE 'null'::jsonb END`;

export async function ensureAccountingFoundationSchema(database: Pick<typeof pool, "connect">) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(804610, 0)");
    await client.query(ACCOUNTING_FOUNDATION_SQL);
    await client.query(ACCOUNTING_AFFAIRS_SQL);
    await client.query(ACCOUNTING_SOURCE_REVIEW_SQL);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export const ACCOUNTING_FOUNDATION_SQL = `
CREATE TABLE IF NOT EXISTS accounting_books (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name))>0), currency TEXT NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
 policy_version TEXT, policy JSONB NOT NULL DEFAULT '{}', owner_approval TEXT, accountant_approval TEXT,
 approved_by INTEGER REFERENCES users(id), approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(status='draft' OR (coalesce(length(trim(policy_version)),0)>0 AND coalesce(length(trim(owner_approval)),0)>0
 AND coalesce(length(trim(accountant_approval)),0)>0 AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS accounting_book_branches (
 book_id INTEGER NOT NULL REFERENCES accounting_books(id), branch_id INTEGER NOT NULL REFERENCES branches(id),
 PRIMARY KEY(book_id,branch_id), UNIQUE(branch_id)
);
CREATE TABLE IF NOT EXISTS accounting_accounts (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES accounting_books(id), code TEXT NOT NULL CHECK(length(trim(code))>0),
 name TEXT NOT NULL CHECK(length(trim(name))>0), category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','income','expense')),
 active BOOLEAN NOT NULL DEFAULT true, UNIQUE(book_id,code), UNIQUE(id,book_id)
);
CREATE TABLE IF NOT EXISTS accounting_periods (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES accounting_books(id), name TEXT NOT NULL,
 starts_on DATE NOT NULL, ends_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 CHECK(starts_on<=ends_on), UNIQUE(id,book_id)
);
CREATE TABLE IF NOT EXISTS accounting_tax_configurations (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 request_id TEXT NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,80}$'), effective_from DATE NOT NULL,
 policy_version TEXT NOT NULL, payload JSONB NOT NULL, payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','cancelled')),
 prepared_by INTEGER NOT NULL REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id),
 decision_reason TEXT, approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(book_id,branch_id,request_id), FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id),
 CHECK(state='pending' OR (reviewed_by IS NOT NULL AND length(trim(decision_reason))>0)),
 CHECK(state<>'approved' OR (reviewed_by<>prepared_by AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_tax_one_pending ON accounting_tax_configurations(book_id,branch_id) WHERE state='pending';
CREATE UNIQUE INDEX IF NOT EXISTS accounting_tax_effective_version ON accounting_tax_configurations(book_id,branch_id,effective_from) WHERE state='approved';
CREATE TABLE IF NOT EXISTS accounting_grants (
 book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
 permission TEXT NOT NULL CHECK(permission IN ('read','configure','prepare','post','reverse','close','reopen')),
 evidence TEXT NOT NULL CHECK(length(trim(evidence))>0), granted_by INTEGER NOT NULL REFERENCES users(id),
 PRIMARY KEY(book_id,branch_id,user_id,permission),
 FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id)
);
CREATE TABLE IF NOT EXISTS accounting_journals (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 period_id INTEGER NOT NULL, currency TEXT NOT NULL, accounting_date DATE NOT NULL,
 event_key TEXT NOT NULL CHECK(length(trim(event_key)) BETWEEN 1 AND 200), payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 narration TEXT NOT NULL CHECK(length(trim(narration)) BETWEEN 1 AND 4000), evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 1 AND 4000),
 kind TEXT NOT NULL CHECK(kind IN ('manual','reversal')), reversal_of INTEGER REFERENCES accounting_journals(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','cancelled')),
 prepared_by INTEGER NOT NULL REFERENCES users(id), posted_by INTEGER REFERENCES users(id), posted_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(id,book_id), UNIQUE(book_id,event_key),
 FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id),
 FOREIGN KEY(period_id,book_id) REFERENCES accounting_periods(id,book_id),
 CHECK((kind='reversal')=(reversal_of IS NOT NULL)),
 CHECK(status<>'posted' OR (posted_by IS NOT NULL AND posted_by<>prepared_by AND posted_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_one_active_reversal ON accounting_journals(reversal_of)
 WHERE reversal_of IS NOT NULL AND status<>'cancelled';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=current_schema() AND c.relname='accounting_one_reversal' AND c.relkind='i') THEN
   EXECUTE format('DROP INDEX %I.accounting_one_reversal',current_schema());
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS accounting_journal_date ON accounting_journals(book_id,branch_id,accounting_date);
CREATE TABLE IF NOT EXISTS accounting_journal_lines (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, journal_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
 debit_minor BIGINT NOT NULL DEFAULT 0, credit_minor BIGINT NOT NULL DEFAULT 0, memo TEXT NOT NULL DEFAULT '',
 FOREIGN KEY(journal_id,book_id) REFERENCES accounting_journals(id,book_id),
 FOREIGN KEY(account_id,book_id) REFERENCES accounting_accounts(id,book_id),
 CHECK(debit_minor BETWEEN 0 AND 999999999999999999 AND credit_minor BETWEEN 0 AND 999999999999999999),
 CHECK((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0))
);
CREATE INDEX IF NOT EXISTS accounting_lines_journal ON accounting_journal_lines(journal_id);
CREATE TABLE IF NOT EXISTS accounting_source_events (
 book_id INTEGER NOT NULL REFERENCES accounting_books(id), event_key TEXT NOT NULL, journal_id INTEGER NOT NULL,
 PRIMARY KEY(book_id,event_key), UNIQUE(journal_id),
 FOREIGN KEY(journal_id,book_id) REFERENCES accounting_journals(id,book_id)
);
CREATE TABLE IF NOT EXISTS accounting_audit (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES accounting_books(id),
 branch_id INTEGER REFERENCES branches(id), actor_id INTEGER NOT NULL REFERENCES users(id),
 journal_id INTEGER REFERENCES accounting_journals(id), period_id INTEGER REFERENCES accounting_periods(id),
 action TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason))>0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(journal_id,book_id) REFERENCES accounting_journals(id,book_id),
 FOREIGN KEY(period_id,book_id) REFERENCES accounting_periods(id,book_id),
 FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id)
);

CREATE TABLE IF NOT EXISTS accounting_opening_setup (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 request_key TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), payload JSONB NOT NULL,
 prepared_by INTEGER NOT NULL REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id),
 journal_id INTEGER REFERENCES accounting_journals(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','rejected','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ,
 FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id),
 UNIQUE(book_id,branch_id,request_key), UNIQUE(journal_id),
 CHECK(state<>'verified' OR (reviewed_by IS NOT NULL AND reviewed_by<>prepared_by AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_one_current_opening_setup ON accounting_opening_setup(book_id,branch_id)
 WHERE state IN ('pending','verified');
ALTER TABLE accounting_audit ADD COLUMN IF NOT EXISTS opening_setup_id INTEGER REFERENCES accounting_opening_setup(id);
ALTER TABLE accounting_audit ADD COLUMN IF NOT EXISTS tax_configuration_id INTEGER REFERENCES accounting_tax_configurations(id);

CREATE OR REPLACE FUNCTION accounting_opening_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE a accounting_audit%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Opening setup history is immutable'; END IF;
 PERFORM pg_advisory_xact_lock(804610,NEW.book_id);
 IF jsonb_typeof(NEW.payload->'chart') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.payload->'request'->'balances') IS DISTINCT FROM 'array'
 OR jsonb_array_length(NEW.payload->'chart') NOT BETWEEN 1 AND 200
 OR jsonb_array_length(NEW.payload->'request'->'balances')<>jsonb_array_length(NEW.payload->'chart')
 THEN RAISE EXCEPTION 'Complete opening chart and explicit balances required'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'pending' OR NEW.reviewed_by IS NOT NULL OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'prepare')
   THEN RAISE EXCEPTION 'Authorised pending opening preparation required'; END IF;
   IF NEW.journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_journals WHERE id=NEW.journal_id AND book_id=NEW.book_id
     AND branch_id=NEW.branch_id AND prepared_by=NEW.prepared_by AND status='draft' AND event_key LIKE 'opening:%')
   THEN RAISE EXCEPTION 'Matching opening draft required'; END IF;
 ELSE
   IF OLD.state<>'pending' OR (to_jsonb(NEW)-ARRAY['state','reviewed_by','reviewed_at'])<>(to_jsonb(OLD)-ARRAY['state','reviewed_by','reviewed_at'])
   THEN RAISE EXCEPTION 'Opening payload/final version is immutable'; END IF;
   SELECT * INTO a FROM accounting_audit WHERE opening_setup_id=NEW.id AND action='opening_'||NEW.state
     AND xmin::text=pg_current_xact_id()::text ORDER BY id DESC LIMIT 1;
   IF a.id IS NULL OR a.actor_id IS DISTINCT FROM NEW.reviewed_by THEN RAISE EXCEPTION 'Atomic opening decision audit required'; END IF;
   IF NEW.state='cancelled' THEN
     IF NEW.reviewed_by<>NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.reviewed_by,'prepare')
     THEN RAISE EXCEPTION 'Original opening preparer cancellation required'; END IF;
   ELSIF NEW.state IN ('verified','rejected') THEN
     IF NEW.reviewed_by=NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.reviewed_by,'post')
     THEN RAISE EXCEPTION 'Independent opening reviewer required'; END IF;
   ELSE RAISE EXCEPTION 'Invalid opening transition'; END IF;
   IF NEW.state='verified' THEN
     IF NOT EXISTS(SELECT 1 FROM accounting_books b JOIN accounting_periods p ON p.book_id=b.id
       WHERE b.id=NEW.book_id AND b.status='approved' AND b.policy_version=NEW.payload->'request'->>'policyVersion'
       AND b.policy->>'cutoverDate'=NEW.payload->'request'->>'cutoverDate' AND p.status='open'
       AND (b.policy->>'cutoverDate')::date BETWEEN p.starts_on AND p.ends_on)
     THEN RAISE EXCEPTION 'Approved opening policy/date/open period required'; END IF;
     IF (SELECT count(DISTINCT b->>'accountId') FROM jsonb_array_elements(NEW.payload->'request'->'balances') b)<>jsonb_array_length(NEW.payload->'chart')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'request'->'balances') b
       WHERE b->>'debit' !~ '^(0|[1-9][0-9]*)([.][0-9]{1,2})?$' OR b->>'credit' !~ '^(0|[1-9][0-9]*)([.][0-9]{1,2})?$'
       OR coalesce(length(trim(b->>'evidence')),0)=0 OR ((b->>'debit')::numeric<>0 AND (b->>'credit')::numeric<>0))
     OR EXISTS((SELECT id FROM accounting_accounts WHERE book_id=NEW.book_id EXCEPT SELECT (b->>'accountId')::int FROM jsonb_array_elements(NEW.payload->'request'->'balances') b)
       UNION ALL (SELECT (b->>'accountId')::int FROM jsonb_array_elements(NEW.payload->'request'->'balances') b EXCEPT SELECT id FROM accounting_accounts WHERE book_id=NEW.book_id))
     THEN RAISE EXCEPTION 'Every opening account requires one exact supported balance'; END IF;
     IF NEW.journal_id IS NOT NULL AND EXISTS(
       (SELECT account_id,debit_minor::numeric,credit_minor::numeric FROM accounting_journal_lines WHERE journal_id=NEW.journal_id
        EXCEPT SELECT (b->>'accountId')::int,(b->>'debit')::numeric*100,(b->>'credit')::numeric*100 FROM jsonb_array_elements(NEW.payload->'request'->'balances') b
          WHERE (b->>'debit')::numeric<>0 OR (b->>'credit')::numeric<>0)
       UNION ALL
       (SELECT (b->>'accountId')::int,(b->>'debit')::numeric*100,(b->>'credit')::numeric*100 FROM jsonb_array_elements(NEW.payload->'request'->'balances') b
          WHERE (b->>'debit')::numeric<>0 OR (b->>'credit')::numeric<>0
        EXCEPT SELECT account_id,debit_minor::numeric,credit_minor::numeric FROM accounting_journal_lines WHERE journal_id=NEW.journal_id))
     THEN RAISE EXCEPTION 'Posted opening must exactly match the complete schedule'; END IF;
   END IF;
   IF NEW.state='verified' AND NEW.journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_journals WHERE id=NEW.journal_id
     AND book_id=NEW.book_id AND branch_id=NEW.branch_id AND status='posted' AND event_key LIKE 'opening:%')
   THEN RAISE EXCEPTION 'Posted matching opening journal required'; END IF;
   IF NEW.state='verified' AND NEW.journal_id IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'request'->'balances') b
     WHERE (b->>'debit')::numeric<>0 OR (b->>'credit')::numeric<>0)
   THEN RAISE EXCEPTION 'Nonzero opening cannot be marked ready without posting'; END IF;
   IF NEW.state='verified' AND EXISTS(
     (SELECT id,code,name,category,active FROM accounting_accounts WHERE book_id=NEW.book_id
      EXCEPT SELECT id,code,name,category,active FROM jsonb_to_recordset(NEW.payload->'chart') x(id int,code text,name text,category text,active boolean))
     UNION ALL
     (SELECT id,code,name,category,active FROM jsonb_to_recordset(NEW.payload->'chart') x(id int,code text,name text,category text,active boolean)
      EXCEPT SELECT id,code,name,category,active FROM accounting_accounts WHERE book_id=NEW.book_id))
   THEN RAISE EXCEPTION 'Opening chart changed before verification'; END IF;
   IF NEW.state IN ('rejected','cancelled') AND NEW.journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_journals WHERE id=NEW.journal_id AND status='cancelled')
   THEN RAISE EXCEPTION 'Rejected opening draft must be cancelled atomically'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_has_grant(b INTEGER, br INTEGER, u INTEGER, p TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path FROM CURRENT AS $$
 SELECT EXISTS(SELECT 1 FROM accounting_grants g JOIN users a ON a.id=g.user_id
 WHERE g.book_id=b AND g.branch_id=br AND g.user_id=u AND g.permission=p AND a.is_active
 AND a.access_profile_migrated_at IS NOT NULL
 AND a.authority_level IN ('super_admin','admin','branch_admin','staff')
 AND a.job_function IN ('general_staff','documentation','accounts','operations','terminal_manager','delivery','security')
 AND jsonb_typeof(a.workspace_access::jsonb)='array'
 AND a.workspace_access::jsonb <@ (${allowedWorkspaceSql})
 AND ((a.job_function='operations' AND jsonb_array_length(a.workspace_access::jsonb)>0)
 OR (a.job_function<>'operations' AND a.workspace_access::jsonb @> (${allowedWorkspaceSql})))
 AND (a.branch_id=br OR a.authority_level IN ('super_admin','admin')))
$$;

CREATE TABLE IF NOT EXISTS accounting_manual_account_rules (
 book_id INTEGER NOT NULL REFERENCES accounting_books(id), account_id INTEGER NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('adjustment','protected')), policy_version TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 1 AND 4000), approved_by INTEGER NOT NULL REFERENCES users(id),
 PRIMARY KEY(book_id,account_id), FOREIGN KEY(account_id,book_id) REFERENCES accounting_accounts(id,book_id)
);
CREATE TABLE IF NOT EXISTS accounting_manual_workflow (
 journal_id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','rejected')),
 replaces_journal_id INTEGER UNIQUE REFERENCES accounting_journals(id),
 FOREIGN KEY(journal_id,book_id) REFERENCES accounting_journals(id,book_id)
);
CREATE OR REPLACE FUNCTION accounting_manual_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE j accounting_journals%ROWTYPE; a accounting_audit%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manual review history is immutable'; END IF;
 PERFORM pg_advisory_xact_lock(804610,NEW.book_id);
 IF TG_TABLE_NAME='accounting_manual_account_rules' THEN
   IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Approved account protection is immutable'; END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_books WHERE id=NEW.book_id AND status='approved' AND policy_version=NEW.policy_version)
   OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.approved_by AND authority_level='super_admin')
   OR EXISTS(SELECT 1 FROM accounting_book_branches b WHERE b.book_id=NEW.book_id AND NOT accounting_has_grant(b.book_id,b.branch_id,NEW.approved_by,'configure'))
   OR NOT EXISTS(SELECT 1 FROM accounting_audit WHERE book_id=NEW.book_id AND actor_id=NEW.approved_by AND action='manual_accounts_reviewed' AND xmin::text=pg_current_xact_id()::text)
   THEN RAISE EXCEPTION 'Documented owner/accountant account protection review required'; END IF;
   IF NEW.role='adjustment' AND EXISTS(SELECT 1 FROM accounting_tax_configurations WHERE book_id=NEW.book_id AND state='approved'
     AND NEW.account_id IN ((payload->>'inputVatAccountId')::integer,(payload->>'outputVatAccountId')::integer))
   THEN RAISE EXCEPTION 'Configured tax controls must remain protected'; END IF;
 ELSE
   SELECT * INTO j FROM accounting_journals WHERE id=NEW.journal_id AND book_id=NEW.book_id FOR UPDATE;
   IF j.status IS DISTINCT FROM 'draft' OR (j.event_key NOT LIKE 'adjustment:%' AND j.kind<>'reversal') THEN RAISE EXCEPTION 'Manual draft required'; END IF;
   IF TG_OP='INSERT' THEN
     IF NEW.state<>'draft' THEN RAISE EXCEPTION 'New manual workflow must be draft'; END IF;
     IF NEW.replaces_journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_journals o JOIN accounting_manual_workflow w ON w.journal_id=o.id
       WHERE o.id=NEW.replaces_journal_id AND o.book_id=j.book_id AND o.branch_id=j.branch_id AND o.status='cancelled' AND o.prepared_by=j.prepared_by AND o.kind='manual')
     THEN RAISE EXCEPTION 'Revision requires matching retained cancelled manual original'; END IF;
     IF j.kind='reversal' AND NOT EXISTS(SELECT 1 FROM accounting_manual_workflow WHERE journal_id=j.reversal_of)
     THEN RAISE EXCEPTION 'Manual reversal cannot bypass source or opening workflow'; END IF;
     IF NOT EXISTS(SELECT 1 FROM accounting_audit WHERE journal_id=j.id AND actor_id=j.prepared_by AND action='prepared' AND xmin::text=pg_current_xact_id()::text)
     THEN RAISE EXCEPTION 'Atomic prepared journal evidence required'; END IF;
   ELSE
     IF NEW.book_id<>OLD.book_id OR NEW.journal_id<>OLD.journal_id OR NEW.replaces_journal_id IS DISTINCT FROM OLD.replaces_journal_id
     THEN RAISE EXCEPTION 'Manual workflow identity is immutable'; END IF;
     IF OLD.state='draft' AND NEW.state='submitted' THEN
       SELECT * INTO a FROM accounting_audit WHERE journal_id=j.id AND action='manual_submitted' AND xmin::text=pg_current_xact_id()::text ORDER BY id DESC LIMIT 1;
       IF a.actor_id IS DISTINCT FROM j.prepared_by OR NOT accounting_has_grant(j.book_id,j.branch_id,a.actor_id,'prepare') THEN RAISE EXCEPTION 'Preparer submission required'; END IF;
     ELSIF OLD.state='submitted' AND NEW.state='rejected' THEN
       SELECT * INTO a FROM accounting_audit WHERE journal_id=j.id AND action='manual_rejected' AND xmin::text=pg_current_xact_id()::text ORDER BY id DESC LIMIT 1;
       IF a.actor_id IS NULL OR a.actor_id=j.prepared_by OR NOT accounting_has_grant(j.book_id,j.branch_id,a.actor_id,'post') THEN RAISE EXCEPTION 'Independent rejection required'; END IF;
     ELSE RAISE EXCEPTION 'Invalid manual workflow transition'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b INTEGER; j accounting_journals%ROWTYPE; approval accounting_audit%ROWTYPE; review JSONB;
BEGIN
 b:=CASE WHEN TG_OP='DELETE' THEN OLD.book_id ELSE NEW.book_id END;
 PERFORM pg_advisory_xact_lock(804610,b);
 IF TG_OP='UPDATE' AND NEW.book_id<>OLD.book_id THEN RAISE EXCEPTION 'Accounting book is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_audit' AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Accounting audit is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_audit' THEN
   IF NEW.tax_configuration_id IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM accounting_tax_configurations WHERE id=NEW.tax_configuration_id AND book_id=NEW.book_id AND branch_id=NEW.branch_id)
   THEN RAISE EXCEPTION 'Tax audit must link the exact configuration scope'; END IF;
 END IF;
 IF TG_TABLE_NAME='accounting_source_events' AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Accounting event link is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_journal_lines' THEN
   SELECT * INTO j FROM accounting_journals WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.journal_id ELSE NEW.journal_id END FOR UPDATE;
   IF j.status<>'draft' THEN RAISE EXCEPTION 'Final journal lines are immutable'; END IF;
   IF EXISTS(SELECT 1 FROM accounting_manual_workflow WHERE journal_id=j.id) THEN RAISE EXCEPTION 'Reviewed manual payload requires a new immutable revision'; END IF;
   IF TG_OP='UPDATE' AND NEW.journal_id<>OLD.journal_id THEN RAISE EXCEPTION 'Journal line link is immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME='accounting_accounts' AND TG_OP<>'INSERT' THEN
   IF EXISTS(SELECT 1 FROM accounting_journal_lines l JOIN accounting_journals h ON h.id=l.journal_id WHERE l.account_id=OLD.id AND h.status='posted')
   THEN RAISE EXCEPTION 'Posted account definition is immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME='accounting_periods' THEN
   IF TG_OP='INSERT' AND NEW.status<>'open' THEN RAISE EXCEPTION 'New period must be open'; END IF;
   IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.starts_on<>OLD.starts_on OR NEW.ends_on<>OLD.ends_on)) THEN
     RAISE EXCEPTION 'Accounting periods cannot be removed or redated';
   END IF;
   IF EXISTS(SELECT 1 FROM accounting_periods p WHERE p.book_id=b AND p.id<>NEW.id
     AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on) THEN RAISE EXCEPTION 'Accounting periods overlap'; END IF;
   IF TG_OP='UPDATE' AND NEW.status<>OLD.status THEN
     IF NOT EXISTS(SELECT 1 FROM accounting_books WHERE id=b AND status='approved') THEN RAISE EXCEPTION 'Approved book required for period close/reopen'; END IF;
     SELECT * INTO approval FROM accounting_audit WHERE period_id=NEW.id AND book_id=b
       AND action=CASE WHEN NEW.status='closed' THEN 'period_closed' ELSE 'period_reopened' END
       AND created_at>=transaction_timestamp() ORDER BY id DESC LIMIT 1;
     IF approval.id IS NULL OR EXISTS(SELECT 1 FROM accounting_book_branches bb WHERE bb.book_id=b
       AND NOT accounting_has_grant(b,bb.branch_id,approval.actor_id,CASE WHEN NEW.status='closed' THEN 'close' ELSE 'reopen' END))
     THEN RAISE EXCEPTION 'Audited all-branch period permission required'; END IF;
     review:=approval.reason::jsonb;
     IF coalesce(length(trim(review->>'evidence')),0)=0 THEN RAISE EXCEPTION 'Period evidence required'; END IF;
     IF NEW.status='closed' AND (review->>'sourceCoverageComplete' IS DISTINCT FROM 'true'
       OR review->>'reconciled' IS DISTINCT FROM 'true' OR review->>'unresolvedMappings' IS DISTINCT FROM '0'
       OR EXISTS(SELECT 1 FROM accounting_journals WHERE period_id=NEW.id AND status='draft'))
     THEN RAISE EXCEPTION 'Period source/reconciliation review and resolved drafts required'; END IF;
   END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION accounting_book_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE k TEXT;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'draft' THEN RAISE EXCEPTION 'New book must be draft'; END IF;
   RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(804610,OLD.id);
 IF OLD.status='approved' THEN RAISE EXCEPTION 'Approved policy is immutable; a new approved version needs a separate migration'; END IF;
 IF NEW.status='approved' THEN
   FOREACH k IN ARRAY ARRAY['legalEntity','financialYearEnd','cutoverDate','revenueRecognition','clientDeposits','passThroughCosts','vat',
   'unpaidExpenses','creditNotes','badDebts','assetsAndAdvances','loansAndFunding','branchAccounting','openingBalances'] LOOP
     IF jsonb_typeof(NEW.policy->k)<>'string' OR coalesce(length(trim(NEW.policy->>k)),0)=0 THEN RAISE EXCEPTION 'Approved policy missing %',k; END IF;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_journal_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE p accounting_periods%ROWTYPE; b accounting_books%ROWTYPE; original accounting_journals%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(804610,CASE WHEN TG_OP='DELETE' THEN OLD.book_id ELSE NEW.book_id END);
 IF TG_OP<>'INSERT' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'Final journal is immutable'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Journal deletion is forbidden; cancel a draft or reverse a posting'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','posted_by','posted_at'])<>(to_jsonb(OLD)-ARRAY['status','posted_by','posted_at']) THEN
   RAISE EXCEPTION 'Journal payload is immutable; prepare a new request';
 END IF;
 SELECT * INTO b FROM accounting_books WHERE id=NEW.book_id;
 SELECT * INTO p FROM accounting_periods WHERE id=NEW.period_id AND book_id=NEW.book_id;
 IF b.status<>'approved' OR NEW.currency<>b.currency OR p.status<>'open' OR NEW.accounting_date NOT BETWEEN p.starts_on AND p.ends_on
 OR NEW.accounting_date<(b.policy->>'cutoverDate')::date THEN RAISE EXCEPTION 'Unapproved book, currency, cutover or closed/out-of-range period'; END IF;
 IF TG_OP='INSERT' AND NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'prepare') THEN RAISE EXCEPTION 'Prepare grant required'; END IF;
 IF NEW.event_key NOT LIKE 'opening:%' AND (TG_OP='INSERT' OR NEW.status='posted') AND NOT EXISTS(SELECT 1 FROM accounting_opening_setup s
   WHERE s.book_id=NEW.book_id AND s.branch_id=NEW.branch_id AND s.state='verified')
 THEN RAISE EXCEPTION 'Verified opening setup required before forward accounting'; END IF;
 IF NEW.kind='reversal' THEN
   SELECT * INTO original FROM accounting_journals WHERE id=NEW.reversal_of;
   IF original.status IS DISTINCT FROM 'posted' OR original.kind='reversal' OR original.book_id<>NEW.book_id OR original.branch_id<>NEW.branch_id
   THEN RAISE EXCEPTION 'Reversal must link a posted original in the same scope'; END IF;
   IF TG_OP='INSERT' AND NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'reverse') THEN RAISE EXCEPTION 'Reversal grant required'; END IF;
 END IF;
 IF NEW.status='posted' AND (TG_OP='INSERT' OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.posted_by,'post')) THEN
   RAISE EXCEPTION 'Independent posting grant required';
 END IF;
 IF NEW.status='posted' AND EXISTS(SELECT 1 FROM accounting_manual_workflow WHERE journal_id=NEW.id AND state<>'submitted') THEN
   RAISE EXCEPTION 'Manual submission required before independent posting';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_validate_posted() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE j accounting_journals%ROWTYPE; n INTEGER; d NUMERIC; c NUMERIC; actor INTEGER;
BEGIN
 IF TG_TABLE_NAME='accounting_journals' THEN
   SELECT * INTO j FROM accounting_journals WHERE id=NEW.id;
 ELSE
   SELECT * INTO j FROM accounting_journals WHERE id=NEW.journal_id;
 END IF;
 IF j.status='posted' THEN
   IF EXISTS(SELECT 1 FROM accounting_manual_workflow WHERE journal_id=j.id) AND (
     EXISTS(SELECT 1 FROM accounting_accounts a LEFT JOIN accounting_manual_account_rules r ON r.account_id=a.id AND r.book_id=a.book_id WHERE a.book_id=j.book_id AND r.account_id IS NULL)
     OR EXISTS(SELECT 1 FROM accounting_journal_lines l LEFT JOIN accounting_manual_account_rules r ON r.account_id=l.account_id AND r.book_id=l.book_id
       WHERE l.journal_id=j.id AND r.role IS DISTINCT FROM 'adjustment')) THEN RAISE EXCEPTION 'Reviewed non-control accounts required'; END IF;
   SELECT count(*),coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0) INTO n,d,c FROM accounting_journal_lines WHERE journal_id=j.id;
   IF n<2 OR d<>c OR d=0 THEN RAISE EXCEPTION 'Posted journal must balance with at least two nonzero lines'; END IF;
   IF EXISTS(SELECT 1 FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.journal_id=j.id AND NOT a.active)
   THEN RAISE EXCEPTION 'Inactive account cannot be posted'; END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_source_events s WHERE s.journal_id=j.id AND s.event_key=j.event_key AND s.book_id=j.book_id)
   OR NOT EXISTS(SELECT 1 FROM accounting_audit a WHERE a.journal_id=j.id AND a.actor_id=j.posted_by AND a.action='posted')
   THEN RAISE EXCEPTION 'Posted journal requires source link and approval audit'; END IF;
   IF j.kind='reversal' AND EXISTS(
     (SELECT account_id,sum(debit_minor) d,sum(credit_minor) c FROM accounting_journal_lines WHERE journal_id=j.id GROUP BY account_id
      EXCEPT SELECT account_id,sum(credit_minor),sum(debit_minor) FROM accounting_journal_lines WHERE journal_id=j.reversal_of GROUP BY account_id)
     UNION ALL
     (SELECT account_id,sum(credit_minor),sum(debit_minor) FROM accounting_journal_lines WHERE journal_id=j.reversal_of GROUP BY account_id
      EXCEPT SELECT account_id,sum(debit_minor),sum(credit_minor) FROM accounting_journal_lines WHERE journal_id=j.id GROUP BY account_id)
   ) THEN RAISE EXCEPTION 'Reversal must exactly offset original accounts'; END IF;
 END IF;
 IF j.status='cancelled' THEN
   SELECT actor_id INTO actor FROM accounting_audit WHERE journal_id=j.id AND book_id=j.book_id AND action='cancelled' ORDER BY id DESC LIMIT 1;
   IF (actor IS NULL OR NOT accounting_has_grant(j.book_id,j.branch_id,actor,'prepare')
     OR (actor<>j.prepared_by AND NOT accounting_has_grant(j.book_id,j.branch_id,actor,'configure')))
     AND NOT EXISTS(SELECT 1 FROM accounting_opening_setup s JOIN accounting_audit a ON a.opening_setup_id=s.id
       WHERE s.journal_id=j.id AND s.state='rejected' AND a.action='opening_rejected' AND a.actor_id=actor
       AND a.xmin::text=pg_current_xact_id()::text AND accounting_has_grant(j.book_id,j.branch_id,actor,'post'))
   THEN RAISE EXCEPTION 'Draft cancellation requires preparer or configured reviewer and immutable audit'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION accounting_tax_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b accounting_books%ROWTYPE; c JSONB; pair RECORD;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Tax configuration history cannot be deleted'; END IF;
 PERFORM pg_advisory_xact_lock(804610,NEW.book_id);
 IF TG_OP='UPDATE' AND (OLD.state<>'pending' OR NEW.state='pending' OR
   (to_jsonb(NEW)-ARRAY['state','reviewed_by','decision_reason','approved_at'])<>(to_jsonb(OLD)-ARRAY['state','reviewed_by','decision_reason','approved_at']))
 THEN RAISE EXCEPTION 'Immutable configuration; submit a new version'; END IF;
 SELECT * INTO b FROM accounting_books WHERE id=NEW.book_id;
 IF b.status<>'approved' OR NEW.policy_version<>b.policy_version OR NEW.effective_from<(b.policy->>'cutoverDate')::date
 OR NEW.payload->>'policyVersion' IS DISTINCT FROM NEW.policy_version OR NEW.payload->>'effectiveFrom' IS DISTINCT FROM NEW.effective_from::text
 OR NEW.payload->>'requestId' IS DISTINCT FROM NEW.request_id THEN RAISE EXCEPTION 'Matching approved policy and effective date required'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.approved_at IS NOT NULL
   OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'configure') THEN RAISE EXCEPTION 'Configuration must start pending with current configure grant'; END IF;
 ELSE
   IF NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.reviewed_by,'configure') OR
   (NEW.state='cancelled' AND NEW.reviewed_by<>NEW.prepared_by) OR (NEW.state IN ('approved','rejected') AND NEW.reviewed_by=NEW.prepared_by)
   THEN RAISE EXCEPTION 'Independent current configuration reviewer required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_audit WHERE tax_configuration_id=NEW.id AND actor_id=NEW.reviewed_by
     AND action='tax_configuration_'||NEW.state AND xmin::text=pg_current_xact_id()::text)
   THEN RAISE EXCEPTION 'Configuration decision requires immutable same-transaction audit'; END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW.state='approved' THEN
   IF coalesce(length(trim(NEW.payload->>'ownerEvidence')),0)=0 OR coalesce(length(trim(NEW.payload->>'accountantEvidence')),0)=0
   OR jsonb_typeof(NEW.payload->'codes') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'codes') NOT BETWEEN 3 AND 12
   THEN RAISE EXCEPTION 'Documented tax rules required'; END IF;
   FOR pair IN SELECT * FROM (VALUES ('inputVatAccountId','asset'),('outputVatAccountId','liability'),('dutyAccountId','expense'),('shippingAccountId','expense'),('terminalAccountId','expense')) v(key,category) LOOP
     IF NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE id=(NEW.payload->>pair.key)::integer AND book_id=NEW.book_id AND active AND category=pair.category)
     THEN RAISE EXCEPTION 'Distinct active own-book VAT/direct expense accounts required'; END IF;
   END LOOP;
   IF (SELECT count(DISTINCT NEW.payload->>k) FROM unnest(ARRAY['inputVatAccountId','outputVatAccountId','dutyAccountId','shippingAccountId','terminalAccountId']) k)<>5
   THEN RAISE EXCEPTION 'VAT/direct expense accounts must differ'; END IF;
   IF EXISTS(SELECT 1 FROM accounting_manual_account_rules WHERE book_id=NEW.book_id AND role='adjustment'
     AND account_id IN ((NEW.payload->>'inputVatAccountId')::integer,(NEW.payload->>'outputVatAccountId')::integer))
   THEN RAISE EXCEPTION 'Tax controls cannot be freehand adjustment accounts'; END IF;
   FOR c IN SELECT value FROM jsonb_array_elements(NEW.payload->'codes') LOOP
     IF coalesce(c->>'treatment','') NOT IN ('taxable','zero_rated','exempt') OR coalesce(length(trim(c->>'basisEvidence')),0)=0
     OR coalesce(c->>'code','') !~ '^[A-Z][A-Z0-9_-]{0,19}$' OR coalesce(length(trim(c->>'name')),0)=0
     OR coalesce(c->>'rate','') !~ '^(0|[1-9][0-9]?|100)([.][0-9]{1,2})?$'
     OR coalesce(c->>'recoverablePercent','') !~ '^(0|[1-9][0-9]?|100)([.][0-9]{1,2})?$'
     OR (c->>'rate')::numeric NOT BETWEEN 0 AND 100 OR (c->>'recoverablePercent')::numeric NOT BETWEEN 0 AND 100
     OR ((c->>'treatment'='taxable') IS DISTINCT FROM ((c->>'rate')::numeric>0))
     OR (c->>'treatment'<>'taxable' AND (c->>'recoverablePercent')::numeric<>0)
     THEN RAISE EXCEPTION 'Valid explicit rate, classification and recovery basis required'; END IF;
   END LOOP;
   IF (SELECT count(DISTINCT value->>'treatment') FROM jsonb_array_elements(NEW.payload->'codes'))<>3
   OR (SELECT count(DISTINCT value->>'code') FROM jsonb_array_elements(NEW.payload->'codes'))<>jsonb_array_length(NEW.payload->'codes')
   THEN RAISE EXCEPTION 'Distinct complete tax categories/codes required'; END IF;
 END IF;
 IF NEW.state='approved' THEN
   IF EXISTS(SELECT 1 FROM accounting_tax_configurations WHERE book_id=NEW.book_id AND branch_id=NEW.branch_id AND state='approved' AND effective_from>=NEW.effective_from)
   OR EXISTS(SELECT 1 FROM accounting_journals WHERE book_id=NEW.book_id AND branch_id=NEW.branch_id AND status='posted' AND accounting_date>=NEW.effective_from
     AND (event_key LIKE 'source:invoice:%' OR event_key LIKE 'source:duty_payment:%' OR event_key LIKE 'source:container_payment:%'))
   THEN RAISE EXCEPTION 'New configuration must not silently reclassify posted history or older versions'; END IF;
 END IF;
 RETURN NEW;
END $$;

DO $$ DECLARE t TEXT; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_tax_configurations'::regclass AND tgname='accounting_tax_guard') THEN
   CREATE TRIGGER accounting_tax_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_tax_configurations FOR EACH ROW EXECUTE FUNCTION accounting_tax_guard();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_opening_setup'::regclass AND tgname='accounting_opening_guard') THEN
   CREATE TRIGGER accounting_opening_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_opening_setup FOR EACH ROW EXECUTE FUNCTION accounting_opening_guard();
 END IF;
 FOREACH t IN ARRAY ARRAY['accounting_manual_account_rules','accounting_manual_workflow'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='accounting_manual_guard') THEN
     EXECUTE format('CREATE TRIGGER accounting_manual_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION accounting_manual_guard()',t);
   END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounting_book_branches','accounting_accounts','accounting_periods','accounting_grants','accounting_journal_lines','accounting_source_events','accounting_audit'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='accounting_guard') THEN
     EXECUTE format('CREATE TRIGGER accounting_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION accounting_guard()',t);
   END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_books'::regclass AND tgname='accounting_book_guard') THEN
   CREATE TRIGGER accounting_book_guard BEFORE INSERT OR UPDATE ON accounting_books FOR EACH ROW EXECUTE FUNCTION accounting_book_guard();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_journals'::regclass AND tgname='accounting_journal_guard') THEN
   CREATE TRIGGER accounting_journal_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_journal_guard();
 END IF;
 FOREACH t IN ARRAY ARRAY['accounting_journals','accounting_journal_lines'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname='accounting_validate_posted') THEN
     EXECUTE format('CREATE CONSTRAINT TRIGGER accounting_validate_posted AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_validate_posted()',t);
   END IF;
 END LOOP;
END $$;
`;
