# CAP-02: Document Readiness and Reviewed OCR

## Purpose and Boundaries

Use the existing container **Documents** tab to collect, classify and review
documents for that container visit. Requirements are not copied automatically
to other containers under the same B/L. This is an advisory readiness checklist,
not a new release, invoice, duty-payment or approval workflow.

An upload alone is never treated as reviewed. Existing files start with their
original contents and history intact, classified as Other and unreviewed.

## Set Up Requirements

1. Open a container in the correct branch, then Documents.
2. A branch administrator or higher opens **Configure requirements** and creates
   a named profile with job type, cargo type and required document categories.
3. Categories are B/L, Assessment, Release, Permit, Receipt and Other.
4. Documentation staff or branch administration select the profile and apply it
   to this visit. Every application is retained with the person and time.
5. Profiles are immutable. To change requirements, create a replacement profile
   and apply it explicitly. Existing visits do not change silently.

Profiles are branch-specific. Other accessible staff can inspect the checklist
and source files but cannot configure or approve reviews. Branch and assigned
client restrictions are enforced on the API, not just by hiding buttons.

## Upload and Review

1. Choose the existing document section and file, then its document category,
   issuer and expiry if applicable. The upload limit remains 20 MB.
2. Choose a previous current version only when replacing that file; otherwise
   leave replacement empty. Never replace a file simply because it shares a B/L.
3. Open Review. Compare the original image/PDF/file with its extracted pages.
4. An OCR suggestion is optional. Explicitly accept it, correct it as needed,
   and enter verified identifiers, amounts, dates or text. These are documentary
   evidence only; they do not update invoices, duties, banks or stage fields.
5. Check classification, issuer and expiry, and tick the source confirmation.
6. Mark reviewed, or reject with a meaningful reason. Reviewer, time, corrected
   fields and the extraction snapshot are retained in history.

Reviewed text does not mean the system independently authenticated the document.
An authorised person remains responsible for checking the source and its validity.

## Status Rules

| Status | Meaning |
| --- | --- |
| Required / missing | No current file in that required category |
| Received | Current file uploaded but not reviewed |
| Reviewed | Human-reviewed, current version, not expired |
| Rejected | Latest review rejected the current file |
| Expired | Expiry date is before today's Africa/Lagos date |

A category is satisfied by at least one current, reviewed, non-expired document.
All configured categories must be satisfied for overall readiness. An
unconfigured checklist is never ready. Expiry is inclusive of its stated day.
The same document cannot satisfy two different categories simultaneously.

## Versions and Retention

Every replacement gets a new stored file and version number. It starts
unreviewed, even if its predecessor was reviewed. The old source and reviews
remain readable. A superseded version cannot be reviewed again.

New uploads, replacements and reviewed legacy files are retained. Reject or
replace them instead of deleting them. Containers with retained document
history cannot be bulk deleted. Unreviewed, unretained legacy files retain
their former uploader/administrator deletion rules. Review and profile changes
use revision checks: a stale screen receives a conflict and must refresh.

## OCR and Manual Fallback

- OCR runs locally on the application server with bundled English language data;
  it does not send document contents to a third-party OCR service.
- Text PDFs use embedded text when available; scanned PDFs are rendered for OCR.
  Supported image decoding depends on the local image library. PDF scans are
  limited to six pages, images to 12 million pixels, and OCR to 60 seconds and
  one running operation per server process. PDF render size is also bounded.
- A busy or failed extraction does not discard the uploaded source. Retry an
  unreviewed file later, or read it manually and enter verified values.
- Reviewed extraction is retained; use a new version instead of re-indexing it.
- Page confidence is not field accuracy. Low-confidence text is flagged. Even
  high-confidence text requires source checking. Embedded text has no measured
  OCR confidence; it is not labelled 100% accurate.
- AI document searches may retrieve raw, unverified extraction. They must not
  treat it as a valid release or a posted transaction.
- Handwriting, blurred phone photos, languages other than English and arbitrary
  real-world layouts have not passed a representative accuracy benchmark.

## Verification and Release

### Measured OCR Limits (2026-10-05)

Five synthetic local probes compared identifier, amount and date exactly:

| Synthetic source | Exact fields | Page confidence |
| --- | --- | --- |
| Clear printed assessment | 3/3 | 94% |
| Skewed serif receipt | 3/3 | 93% |
| Faded low-resolution permit | 3/3 | 88% |
| Heavily blurred scan simulation | 0/3 | 73% |
| Script-font simulation, not handwriting | 2/3 | 78% |

These are bounded examples, not a general accuracy rate. A script-style identifier
was misread despite useful amount/date suggestions; the blurred source produced
no matching fields. Obtain a clearer source or enter values manually after
inspection. Do not approve a source you cannot read. Genuine handwriting and
representative phone photos still need their own benchmark.

Live raster-only PDF OCR recovered all three known fields, but its embedded
preview was blank in the in-app browser. Verify the source through an approved
capable PDF viewer before reviewing; OCR text alone is not source verification.

Consult PROJECT_STATE.md and LIVE_E2E_TEST_REGISTER.md for current publication
and acceptance status. Local browser fixtures, isolated database tests and
synthetic OCR checks are not evidence of a successful production migration.

Controlled live acceptance should reuse an existing test visit, record every
new profile/file/review identifier, verify another visit is unaffected, and
confirm no stage or financial mutation. Retained test documents should be
clearly labelled; do not create duplicates or promise they can be deleted.
