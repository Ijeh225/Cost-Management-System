import type { pool } from "@workspace/db";
import { WORKSPACES_ALLOWED_BY_FUNCTION } from "./access-policy.js";

const allowedWorkspaceSql = `CASE a.job_function ${Object.entries(WORKSPACES_ALLOWED_BY_FUNCTION)
  .map(([job, workspaces]) => `WHEN '${job}' THEN '${JSON.stringify(workspaces)}'::jsonb`).join(" ")} ELSE 'null'::jsonb END`;

export async function ensureAccountingFoundationSchema(database: Pick<typeof pool, "connect">) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(804610, 0)");
    await client.query(ACCOUNTING_FOUNDATION_SQL);
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
CREATE UNIQUE INDEX IF NOT EXISTS accounting_one_reversal ON accounting_journals(reversal_of) WHERE reversal_of IS NOT NULL;
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

CREATE OR REPLACE FUNCTION accounting_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b INTEGER; j accounting_journals%ROWTYPE; approval accounting_audit%ROWTYPE; review JSONB;
BEGIN
 b:=CASE WHEN TG_OP='DELETE' THEN OLD.book_id ELSE NEW.book_id END;
 PERFORM pg_advisory_xact_lock(804610,b);
 IF TG_OP='UPDATE' AND NEW.book_id<>OLD.book_id THEN RAISE EXCEPTION 'Accounting book is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_audit' AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Accounting audit is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_source_events' AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Accounting event link is immutable'; END IF;
 IF TG_TABLE_NAME='accounting_journal_lines' THEN
   SELECT * INTO j FROM accounting_journals WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.journal_id ELSE NEW.journal_id END FOR UPDATE;
   IF j.status<>'draft' THEN RAISE EXCEPTION 'Final journal lines are immutable'; END IF;
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
 IF NEW.kind='reversal' THEN
   SELECT * INTO original FROM accounting_journals WHERE id=NEW.reversal_of;
   IF original.status IS DISTINCT FROM 'posted' OR original.kind='reversal' OR original.book_id<>NEW.book_id OR original.branch_id<>NEW.branch_id
   THEN RAISE EXCEPTION 'Reversal must link a posted original in the same scope'; END IF;
   IF TG_OP='INSERT' AND NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'reverse') THEN RAISE EXCEPTION 'Reversal grant required'; END IF;
 END IF;
 IF NEW.status='posted' AND (TG_OP='INSERT' OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.posted_by,'post')) THEN
   RAISE EXCEPTION 'Independent posting grant required';
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
   IF actor IS NULL OR NOT accounting_has_grant(j.book_id,j.branch_id,actor,'prepare')
     OR (actor<>j.prepared_by AND NOT accounting_has_grant(j.book_id,j.branch_id,actor,'configure'))
   THEN RAISE EXCEPTION 'Draft cancellation requires preparer or configured reviewer and immutable audit'; END IF;
 END IF;
 RETURN NULL;
END $$;

DO $$ DECLARE t TEXT; BEGIN
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
