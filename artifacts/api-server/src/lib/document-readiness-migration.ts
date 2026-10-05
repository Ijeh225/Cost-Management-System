export const documentReadinessMigration = `
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS issuer TEXT;
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS expires_on DATE;
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS previous_version_id INTEGER REFERENCES container_documents(id);
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE container_documents ADD COLUMN IF NOT EXISTS retained INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS document_previous_version_unique ON container_documents(previous_version_id);
CREATE TABLE IF NOT EXISTS document_profiles (
 id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL REFERENCES branches(id), name TEXT NOT NULL,
 job_type TEXT NOT NULL, cargo_type TEXT NOT NULL, required_types TEXT NOT NULL,
 created_by_id INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS document_checklists (
 id SERIAL PRIMARY KEY, container_id INTEGER NOT NULL REFERENCES containers(id),
 profile_id INTEGER NOT NULL REFERENCES document_profiles(id), applied_by_id INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS document_checklist_container_idx ON document_checklists(container_id);
CREATE TABLE IF NOT EXISTS document_reviews (
 id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES container_documents(id),
 reviewer_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('reviewed','rejected')),
 document_type TEXT NOT NULL, issuer TEXT NOT NULL, expires_on DATE,
 accepted_fields TEXT NOT NULL, extraction_snapshot TEXT NOT NULL, notes TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS document_review_document_idx ON document_reviews(document_id);
CREATE OR REPLACE FUNCTION protect_retained_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.retained = 1 THEN
  RAISE EXCEPTION 'Retained document history cannot be deleted' USING ERRCODE = '23503';
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_retained_document_delete ON container_documents;
CREATE TRIGGER protect_retained_document_delete BEFORE DELETE ON container_documents
 FOR EACH ROW EXECUTE FUNCTION protect_retained_document();
`;
