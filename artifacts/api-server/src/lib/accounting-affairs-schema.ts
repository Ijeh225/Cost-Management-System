// Valuations are immutable reviewed schedules, never journals or opening balances.
export const ACCOUNTING_AFFAIRS_SQL = `
CREATE TABLE IF NOT EXISTS accounting_affairs (
 id SERIAL PRIMARY KEY, book_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 request_id TEXT NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,80}$'), payload JSONB NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','cancelled')),
 prepared_by INTEGER NOT NULL REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id),
 decision_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ,
 replaces_id INTEGER REFERENCES accounting_affairs(id),
 UNIQUE(book_id,branch_id,request_id), FOREIGN KEY(book_id,branch_id) REFERENCES accounting_book_branches(book_id,branch_id),
 CHECK(state='pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(decision_reason))>0)),
 CHECK(state<>'approved' OR reviewed_by<>prepared_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_affairs_one_replacement ON accounting_affairs(replaces_id) WHERE state IN ('pending','approved');
ALTER TABLE accounting_audit ADD COLUMN IF NOT EXISTS affairs_id INTEGER REFERENCES accounting_affairs(id);
CREATE OR REPLACE FUNCTION accounting_affairs_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Statement of Affairs history is immutable'; END IF;
 PERFORM pg_advisory_xact_lock(804610,NEW.book_id);
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.decision_reason IS NOT NULL
     OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.prepared_by,'prepare')
     OR NOT EXISTS(SELECT 1 FROM accounting_books WHERE id=NEW.book_id AND status='approved')
   THEN RAISE EXCEPTION 'Authorised pending affairs preparation required'; END IF;
   IF NEW.replaces_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_affairs p WHERE p.id=NEW.replaces_id
      AND p.book_id=NEW.book_id AND p.branch_id=NEW.branch_id AND p.state IN ('approved','rejected','cancelled')
      AND p.payload->'request'->>'asOf'=NEW.payload->'request'->>'asOf')
   THEN RAISE EXCEPTION 'Replacement requires a final version in the same scope/date'; END IF;
 ELSE
   IF OLD.state<>'pending' OR NEW.state='pending'
     OR (to_jsonb(NEW)-ARRAY['state','reviewed_by','reviewed_at','decision_reason'])<>(to_jsonb(OLD)-ARRAY['state','reviewed_by','reviewed_at','decision_reason'])
   THEN RAISE EXCEPTION 'Affairs payload/final version is immutable'; END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_audit WHERE affairs_id=NEW.id AND book_id=NEW.book_id AND branch_id=NEW.branch_id
     AND actor_id=NEW.reviewed_by AND action='affairs_'||NEW.state AND reason=NEW.decision_reason AND xmin::text=pg_current_xact_id()::text)
   THEN RAISE EXCEPTION 'Atomic scoped affairs decision audit required'; END IF;
   IF NEW.state='cancelled' THEN
     IF NEW.reviewed_by<>NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.reviewed_by,'prepare')
     THEN RAISE EXCEPTION 'Original preparer cancellation required'; END IF;
   ELSIF NEW.reviewed_by=NEW.prepared_by OR NOT accounting_has_grant(NEW.book_id,NEW.branch_id,NEW.reviewed_by,'post')
   THEN RAISE EXCEPTION 'Independent affairs reviewer required'; END IF;
 END IF;
 IF NEW.payload->>'bookId' IS DISTINCT FROM NEW.book_id::text OR NEW.payload->>'branchId' IS DISTINCT FROM NEW.branch_id::text
    OR NEW.payload->>'currency' IS DISTINCT FROM (SELECT currency FROM accounting_books WHERE id=NEW.book_id)
 THEN RAISE EXCEPTION 'Affairs payload must match scope/currency'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounting_affairs_guard ON accounting_affairs;
CREATE TRIGGER accounting_affairs_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_affairs FOR EACH ROW EXECUTE FUNCTION accounting_affairs_guard();
CREATE OR REPLACE FUNCTION accounting_affairs_audit_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.affairs_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_affairs WHERE id=NEW.affairs_id AND book_id=NEW.book_id AND branch_id=NEW.branch_id)
 THEN RAISE EXCEPTION 'Affairs audit requires exact scope'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounting_affairs_audit_guard ON accounting_audit;
CREATE TRIGGER accounting_affairs_audit_guard BEFORE INSERT ON accounting_audit FOR EACH ROW EXECUTE FUNCTION accounting_affairs_audit_guard();
`;
