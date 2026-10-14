// Pending decisions do not modify immutable journal payloads; corrected submissions retain their original review.
export const ACCOUNTING_SOURCE_REVIEW_SQL = `
CREATE TABLE IF NOT EXISTS accounting_source_reviews (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, period_id INTEGER NOT NULL,
 request_id TEXT NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('client_deposit','invoice_payment','credit_note','client_credit_application',
 'invoice_writeoff','overhead','overhead_topup','expense_payment','schedule_payment','bank_funding','bank_transfer')),
 source_id INTEGER NOT NULL CHECK(source_id>0), event_key TEXT NOT NULL, accounting_date DATE NOT NULL,
 payload JSONB NOT NULL, payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 snapshot_hash TEXT NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','returned','posted','cancelled')),
 prepared_by INTEGER NOT NULL REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id),
 decision_reason TEXT, journal_id INTEGER REFERENCES accounting_journals(id), replaces_review_id INTEGER REFERENCES accounting_source_reviews(id),
 submitted_at TIMESTAMPTZ, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id),
 FOREIGN KEY(period_id,book_id) REFERENCES accounting_periods(id,book_id),
 UNIQUE(book_id,branch_id,request_id), UNIQUE(journal_id),
 CHECK(state NOT IN ('submitted','returned','posted') OR submitted_at IS NOT NULL),
 CHECK(state NOT IN ('returned','posted','cancelled') OR (reviewed_by IS NOT NULL AND length(trim(decision_reason))>0 AND decided_at IS NOT NULL)),
 CHECK(state NOT IN ('returned','posted') OR reviewed_by<>prepared_by),
 CHECK(state<>'posted' OR journal_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_source_review_active ON accounting_source_reviews(book_id,event_key) WHERE state IN ('draft','submitted');
CREATE INDEX IF NOT EXISTS accounting_source_review_queue ON accounting_source_reviews(book_id,branch_id,state,id);
ALTER TABLE accounting_audit ADD COLUMN IF NOT EXISTS source_review_id INTEGER REFERENCES accounting_source_reviews(id);

CREATE OR REPLACE FUNCTION accounting_source_review_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE j accounting_journals%ROWTYPE; old_review accounting_source_reviews%ROWTYPE; a accounting_audit%ROWTYPE; act TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(804610,CASE WHEN TG_OP='DELETE' THEN OLD.book_id ELSE NEW.book_id END);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Source review history cannot be deleted'; END IF;
 IF NEW.event_key<>('source:'||(CASE WHEN NEW.source_kind='client_credit_application' THEN 'invoice_payment' ELSE NEW.source_kind END)||':'||NEW.source_id||':v1')
 OR NEW.payload->'input'->>'eventKey' IS DISTINCT FROM NEW.event_key OR (NEW.payload->'input'->>'bookId')::int IS DISTINCT FROM NEW.book_id
 OR (NEW.payload->'input'->>'branchId')::int IS DISTINCT FROM NEW.branch_id OR (NEW.payload->'input'->>'accountingDate')::date IS DISTINCT FROM NEW.accounting_date
 OR NEW.payload->'request'->'source'->>'kind' IS DISTINCT FROM NEW.source_kind
 OR (NEW.payload->'request'->'source'->>'id')::int IS DISTINCT FROM NEW.source_id
 OR NEW.payload->'request'->>'requestId' IS DISTINCT FROM NEW.request_id
 THEN RAISE EXCEPTION 'Exact source snapshot and scope required'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'draft' OR NEW.reviewed_by IS NOT NULL OR NEW.journal_id IS NOT NULL
   OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'prepare') THEN RAISE EXCEPTION 'Named preparer draft required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_periods WHERE id=NEW.period_id AND book_id=NEW.book_id AND status='open'
     AND NEW.accounting_date BETWEEN starts_on AND ends_on) THEN RAISE EXCEPTION 'Open source review period required'; END IF;
   IF NEW.replaces_review_id IS NOT NULL THEN
     SELECT * INTO old_review FROM accounting_source_reviews WHERE id=NEW.replaces_review_id;
     IF old_review.book_id IS DISTINCT FROM NEW.book_id OR old_review.branch_id<>NEW.branch_id OR old_review.event_key<>NEW.event_key
       OR old_review.prepared_by<>NEW.prepared_by OR old_review.state NOT IN ('returned','cancelled') THEN RAISE EXCEPTION 'Retained own-source returned revision required'; END IF;
   END IF;
   RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','reviewed_by','decision_reason','journal_id','submitted_at','decided_at'])
   <> (to_jsonb(OLD)-ARRAY['state','reviewed_by','decision_reason','journal_id','submitted_at','decided_at'])
 THEN RAISE EXCEPTION 'Review payload immutable; prepare a retained correction'; END IF;
 IF OLD.state IN ('returned','posted','cancelled') THEN RAISE EXCEPTION 'Final source reviews are immutable'; END IF;
 act:=CASE WHEN OLD.state='draft' AND NEW.state='submitted' THEN 'submitted'
   WHEN OLD.state='draft' AND NEW.state='cancelled' THEN 'cancelled'
   WHEN OLD.state='submitted' AND NEW.state='returned' THEN 'returned'
   WHEN OLD.state='submitted' AND NEW.state='posted' THEN 'posted'
   WHEN OLD.state='submitted' AND NEW.state='submitted' AND OLD.journal_id IS NULL AND NEW.journal_id IS NOT NULL THEN 'post_requested'
   ELSE NULL END;
 IF act IS NULL THEN RAISE EXCEPTION 'Unsupported source review transition'; END IF;
 IF act='post_requested' AND (to_jsonb(NEW)-'journal_id')<>(to_jsonb(OLD)-'journal_id')
 THEN RAISE EXCEPTION 'Journal binding cannot change retained submission evidence'; END IF;
 IF act='submitted' AND (NEW.journal_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.decision_reason IS NOT NULL OR NEW.decided_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Unposted independent submission required'; END IF;
 SELECT * INTO a FROM accounting_audit WHERE source_review_id=NEW.id AND action='source_review_'||act
   AND book_id=NEW.book_id AND branch_id=NEW.branch_id AND xmin::text=pg_current_xact_id()::text ORDER BY id DESC LIMIT 1;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Atomic source review decision audit required'; END IF;
 IF act IN ('submitted','cancelled') THEN
   IF a.actor_id<>NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,a.actor_id,'prepare') THEN RAISE EXCEPTION 'Original preparer decision required'; END IF;
 ELSE
   IF a.actor_id=NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,a.actor_id,'post') THEN RAISE EXCEPTION 'Different named reviewer required'; END IF;
 END IF;
 IF act IN ('cancelled','returned','posted') AND NEW.reviewed_by IS DISTINCT FROM a.actor_id THEN RAISE EXCEPTION 'Exact decision actor required'; END IF;
 IF act IN ('cancelled','returned','posted') AND trim(NEW.decision_reason) IS DISTINCT FROM trim(a.reason) THEN RAISE EXCEPTION 'Exact decision reason required'; END IF;
 IF NEW.journal_id IS NOT NULL THEN
   SELECT * INTO j FROM accounting_journals WHERE id=NEW.journal_id;
   IF j.book_id IS DISTINCT FROM NEW.book_id OR j.branch_id<>NEW.branch_id OR j.event_key<>NEW.event_key
     OR j.prepared_by<>NEW.prepared_by OR j.payload_hash<>NEW.snapshot_hash
     OR (act='posted' AND (j.status<>'posted' OR j.posted_by<>a.actor_id)) THEN RAISE EXCEPTION 'Exact original prepared/posted source journal required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION accounting_source_review_prepared() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM accounting_audit WHERE source_review_id=NEW.id AND book_id=NEW.book_id AND branch_id=NEW.branch_id
   AND actor_id=NEW.prepared_by AND action='source_review_prepared' AND xmin::text=pg_current_xact_id()::text)
 THEN RAISE EXCEPTION 'Atomic source review preparation audit required'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION accounting_source_review_link_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_TABLE_NAME='accounting_audit' THEN
   IF NEW.source_review_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_source_reviews
     WHERE id=NEW.source_review_id AND book_id=NEW.book_id AND branch_id=NEW.branch_id)
   THEN RAISE EXCEPTION 'Exact source review audit scope required'; END IF;
 ELSIF TG_TABLE_NAME='accounting_journals' THEN
   IF NEW.status='posted' AND EXISTS(SELECT 1 FROM accounting_source_reviews WHERE journal_id=NEW.id AND state<>'submitted')
   THEN RAISE EXCEPTION 'Source submission required before posting'; END IF;
 ELSE
   IF NEW.status='closed' AND OLD.status='open' AND EXISTS(SELECT 1 FROM accounting_source_reviews WHERE period_id=NEW.id AND state IN ('draft','submitted'))
   THEN RAISE EXCEPTION 'Pending source reviews prevent period close'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_source_reviews'::regclass AND tgname='accounting_source_review_guard') THEN
   CREATE TRIGGER accounting_source_review_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_source_reviews FOR EACH ROW EXECUTE FUNCTION accounting_source_review_guard();
   CREATE CONSTRAINT TRIGGER accounting_source_review_prepared AFTER INSERT ON accounting_source_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_source_review_prepared();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='accounting_audit'::regclass AND tgname='accounting_source_review_link_guard') THEN
   CREATE TRIGGER accounting_source_review_link_guard BEFORE INSERT ON accounting_audit FOR EACH ROW EXECUTE FUNCTION accounting_source_review_link_guard();
   CREATE TRIGGER accounting_source_review_post_guard BEFORE UPDATE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_source_review_link_guard();
   CREATE TRIGGER accounting_source_review_period_guard BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION accounting_source_review_link_guard();
 END IF;
END $$;
`;
