# Application Capability, UX and Competitive Review

Review date: 2026-09-08, Africa/Lagos (UTC+01:00).
Baseline: master at 38b423f, before documentation-only review changes.
Status: research and proposals. No product features implemented by this review.

## 1. Executive Assessment

The application has a substantial specialised foundation for a Nigerian clearing
business: independent departmental work, container costing, collections, duty,
approvals, payment schedules, bank records, reports, and controlled AI assistance.
It should not be described as missing these basic modules or rebuilt from scratch.

The next opportunity is to make that foundation easier to operate and more
preventive: identify the next action, prevent avoidable delay costs, show missing
documents, and let clients obtain approved information without calling staff.

It is not yet equivalent in scope to a complete terminal operating system (TOS).
Recording gate events and terminal releases is different from managing physical
yard positions, equipment dispatch, storage tariffs, cargo inventory and truck
appointments. Those additions make sense only if the business operates the yard,
not merely clears containers through someone else's terminal.

Two newly identified defects deserve attention ahead of major expansion:
Stage Notes crashes on opening, and Documentation has keyboard/field-label gaps.
There is also a financial presentation inconsistency: the invoice list includes
draft balances in its Outstanding card, unlike the dashboard's issued-invoice
receivables. This is not evidence that bank transactions changed or disappeared.

Recommended direction: repair these issues, simplify daily navigation, add
document readiness and free-time forecasting, then develop customer self-service.
Treat shipment grouping as a foundational design decision before larger expansion.

## 2. Evidence and Review Boundaries

Reviewed the current authoritative sections of PROJECT_STATE.md and
LIVE_E2E_TEST_REGISTER.md, the latest reconciliation session summary, the manual's
module inventory and relevant operating instructions, frontend routes/components,
API routes, database schema and targeted capability implementations.

Read-only live browser inspection covered:

| Screen | What was inspected now |
| --- | --- |
| Dashboard | Operations and Financial views, basis descriptions, source links and status legend |
| Documentation | Active/submitted navigation, expanded job fields, visible design and accessibility tree |
| Reports | Report catalogue, upper filters, multiple report sections, scheduled delivery and financial evidence views |
| Container 31 | Header navigation, commercial summary, tabs and Stage Notes interaction |
| Terminal/TDO | Active/released work queue, owner/date presentation and accessible expansion controls |
| Invoices | Narrow-layout cards, action placement and summary wording; corresponding source population |

Visual inspection used the available approximately 619-pixel-wide in-app browser
surface in dark mode. Current screens generally stacked into readable narrow
layouts. This was not a new desktop/mobile device matrix, measured contrast audit,
screen-reader certification, load test or full financial write test. Broader
module coverage below combines source/manual review and earlier recorded testing;
it does not claim every module was executed again today.

No invoices, payments, releases, documents, accounts or messages were created,
edited, deleted or sent. Previous audit closures remain valid for their recorded
scope; newly discovered defects have separate REVIEW IDs.

Evidence labels used below:

- **Observed:** current live browser behaviour.
- **Source-confirmed:** current routes/schema/components support the finding.
- **Not found:** no dedicated implementation found in the reviewed source areas;
  this is not a claim about undisclosed integrations or external business tools.
- **Vendor claim:** a public first-party feature description, not a hands-on test
  of a purchased competitor installation.
- **Proposal:** our recommended design, not something already implemented.

The supplied RaspibTech URL is a marketing article about custom software. It is
not an authenticated product demonstration, and its outcome percentages were not
independently verified. No claim that its interface is better than ours is made.

## 3. What We Already Have

| Area | Existing capability | Boundary / useful extension |
| --- | --- | --- |
| Dashboard | Operational estimates and separate financial view with P&L links | More prominent basis/date context and role-specific action priorities |
| Operations and pipeline | Job stages, next actions, delays, expected/actual milestones | One job overview that explains concurrent desk work versus physical stage |
| Department workspaces | Documentation, Accounts, Transire, Shipping, TDO, Pull-Out, Terminal and Delivery | Consistent interaction patterns and typed responsibility assignments |
| Containers and verification | Registration, verification/berthing officers, locks, charges, client links, history and uploads | Shipment parent and repeat-visit model; better contextual navigation |
| Gate Security | Loaded/empty entry and exit with readiness/order controls | QR-assisted lookup, vehicle visits, inspection evidence and yard links |
| Clients | Contact profiles, agreed clearing rate, history, statements, deposits/credits | Credit policies, commercial contracts and customer-facing access |
| Invoices and AR | Multi-container invoice items, draft/issued/payment/correction lifecycle, aging and collections | Quotes, explicit draft-versus-collectible totals and collections workflow |
| Duty Payments | Assessed amounts, receipts/payment facts, reversals and reconciliation | Versioned duty-estimate assistance, not replacement of official assessment |
| Schedules and approvals | Requested/approved/paid amounts, event history, controlled posting | Supplier bills, commitments and predictable future cash requirements |
| Banks | Accounts, funding, transfers, source-derived transaction records and reference protection | External bank-statement import/matching and reconciliation sign-off |
| Container Payments | Section-linked disbursements, categories and budget/actual comparison | Cost-to-reimbursement mapping and structured supplier information |
| Overheads | Categories, direct/scheduled payments and statements | Period planning, supplier bills and close controls |
| Reports | Duty/workflow ledgers, financial movements, reconciliation, P&L, cash flow, aging, VAT, statements, delivery and branch comparison | Searchable report centre, saved presets and clearer basis labels |
| Scheduled reports | Daily/weekly Duty Ledger and Workflow summaries | Broader approved report types; not all reports are currently subscribable |
| Tasks and notifications | Assigned tasks, deadlines, priority, branch-aware alerts and workflow history | Unified exception queue, escalation and leave-cover assignment |
| Communication | Email capabilities; WhatsApp invoice/reminder/receipt/berthing support | Customer preferences and monitored milestone messaging across departments |
| Tracking | Maersk in-app API path; external carrier tracking links | Multi-carrier event ingestion, freshness and explicit carrier selection |
| Documents and AI | File storage/preview, readable-text indexing, cited answers, controlled drafts/actions and evaluation | Scanned-image OCR with human review; better document lifecycle metadata |
| Users, branches, settings | Authority/function/workspace/branch controls and administrative settings | MFA/recovery and clearer permission preview; not a multi-company SaaS boundary |
| Testing and continuity | Live-test register, isolated database regressions, checkpoints and session summaries | Automated release checks and repeatable restore exercises |

Do not confuse similarly named capabilities:

- A stage deadline is not a shipping-line free-time agreement.
- A file upload is not an approved, current compliance document.
- A linked list of invoice containers is not a shipment/B/L parent model.
- A bank ledger derived from app transactions is not reconciliation to the bank's
  independent statement.
- Current P&L is the app's documented management reporting basis, not proof of a
  configurable double-entry general ledger or statutory financial statements.
- An isolated test database is not automatically a separately deployed staging
  web application with isolated storage, accounts and disabled external sends.

## 4. RaspibTech Comparison

The article describes these capabilities; these are claims, not verified product
acceptance. Its useful differentiators for this review are in the second half of
the table. [RaspibTech article](https://www.raspibtech.com/blog/clearing-forwarding-agent-management-software-nigeria).

| Article capability | Our reviewed position | Recommendation |
| --- | --- | --- |
| Job tracking | Present | Improve usability |
| Billing and statements | Present | Extend, not replace |
| Duty records | Present | Retain source controls |
| Document storage | Present | Add lifecycle metadata |
| Free-day countdown | No dedicated engine found | Add forecasting |
| Client portal | No dedicated portal found | Add scoped self-service |
| Document checklist/expiry | No structured implementation found | Extend documents |
| HS/CIF estimation | No dedicated implementation found | Add reviewed estimates |
| Multi-container jobs | Container-centric model | Add shipment parent |
| Import/export variants | Predominantly import-clearing stages | Expand only for actual demand |

Our recommendation is not to copy the article's promised savings, tariff claims
or price comparisons. Confirm rules, licensing, integrations and operational fit
before relying on any vendor's marketing description.

## 5. Other Relevant Products and Lessons

| Source | Verified public description | Relevant lesson, not a purchase recommendation |
| --- | --- | --- |
| [CargoWise Rates and Contracts](https://www.cargowise.com/solutions/cargowise-forwarding/cargowise-rates-and-contracts/) | Buy/sell rate comparison, costing and quote-to-booking workflows | Connect commercial promises to job budgets, instead of repeatedly typing prices |
| [Magaya Digital Freight Portal](https://www.magaya.com/digital-freight-portal/) | Branded customer access to shipments, selected milestones, documents, reports and invoices | Clients need a permission-limited service experience, not internal staff accounts |
| [GoFreight Workflow Automation](https://gofreight.com/product/workflow-automation/) | Free-time alerts and milestone communications | Prioritize exceptions before costs accumulate; link communication to events |
| [GoFreight Billing and Accounting](https://gofreight.com/product/freight-billing-accounting/) | Shipment profitability, agent settlements, multi-currency accounting and accounting connections | Separate our strong cost-control functions from broader accounting/partner needs |
| [PortPro Container Tracking](https://portpro.io/features/drayage-carrier/container-tracking) | Last-free-day and container hold visibility | Make readiness and commercial deadlines visible alongside operational stage |
| [PortPro Driver Documentation](https://help.portpro.io/support/solutions/articles/154000228567-how-to-upload-and-manage-documents-in-the-driver-app) | Driver document capture and signed proof of delivery | Delivery confirmation should link to attributable evidence, not only a date |
| [Kaleris Terminal Operating Systems](https://kaleris.com/solutions/terminal-operating-system/) | Yard, gate, transport and equipment execution/optimization | Physical-terminal management is a separate capability layer beyond release desks |
| [DCSA Track & Trace](https://dcsa.org/standards/track-and-trace/standard-documentation-track-and-trace) | Shared event/interface definitions and API specifications | Use standard event models where appropriate, but obtain actual provider access separately |
| [Nigeria Trade Information Portal](https://tip.nsw.gov.ng/) | Official procedures, tariff/classification tools, duty calculator and links to NSW/B'Odogwu | Use current official references; do not promise unauthorised automatic customs filing |

No Nigerian integration, hardware compatibility, paid-plan entitlement, uptime,
cost saving or implementation price is inferred merely from these pages. Foreign
customs modules are not proof of Nigerian customs support. No sales enquiry or
data transfer to these vendors was made.

## 6. Current UX Findings and Corrections

### 6.1 Confirmed new defects

**REVIEW-NOTES-001 | High | Container detail / Stage Notes**

- Observed on container 31: badge showed 1348; opening Stage Notes replaced the
  page with `f.map is not a function`.
- Source: client requests `/api/containers/:id/stage-notes`; root-mounted
  containers router registers `/:id/stage-notes` for GET and POST. The component
  assumes the result supports `.length` and `.map`.
- The route mismatch and missing runtime shape check are confirmed. An HTML
  fallback producing a string is a plausible explanation of 1348, but the exact
  live response body was not captured in this review.
- Needed repair: align existing route contracts; require an array response;
  contain fetch errors within the panel; test read/add and branch isolation.
- Impact: users lose access to the current detail screen when opening notes.
  No evidence of lost notes or changed financial data. No write test performed.

**REVIEW-A11Y-001 | Medium | Documentation workspace**

- Live AX exposes the expandable card as a container and several fields without
  accessible names. Source uses a clickable div without keyboard handling or
  button semantics, plus sibling Label/Input elements without linked IDs.
- Needed repair: reuse the semantic expandable-button pattern already seen in
  Terminal/TDO; connect field labels and descriptions; verify keyboard focus and
  screen-reader names. Do not redesign the departmental data model for this fix.
- Benefit: keyboard, assistive-technology and ordinary form users can reliably
  open jobs and identify fields. W3C documents native controls and explicit label
  association as relevant techniques. [Native controls](https://www.w3.org/WAI/WCAG22/Techniques/html/H91.html),
  [form labels](https://www.w3.org/WAI/tutorials/forms/labels/).

**REVIEW-LABEL-001 | Medium | Invoice summary versus Dashboard/AR terminology**

- Current invoice list shows Outstanding NGN1,180 while dashboard receivables
  shows NGN1,000 in All Branches. Source sums all invoices except cancelled and
  written-off, including drafts, for the invoice list's Outstanding card.
- This is a population/label distinction, not proof of a corrupt ledger. The
  numeric difference was observed; individual invoices were not re-audited today.
- Needed decision/fix: show Issued Outstanding and Draft Value separately, or
  explicitly label the draft-inclusive figure. Reuse canonical invoice eligibility
  rules for collectible debt and explain whether summary cards follow filters.
- Impact: staff can mistake draft proposals for money customers currently owe.

### 6.2 Improvements to the current experience

| Observation | Proposed improvement | Priority / benefit |
| --- | --- | --- |
| Reports has many useful sections below long data tables | Searchable catalogue grouped into Operations, Collections, Cash/Bank, Profitability and Compliance; dedicated report routes | High: less scrolling and choosing the wrong report |
| Reports includes a Financial tab for budget-oriented summaries, distinct from P&L | Rename to Budgeted Job Financials; visible basis, date-field and scope chips on every output | High: fewer false reconciliation complaints |
| Finance view says True Net Profit while describing a specific mixed recognition basis | Use Management Net Profit, retain the exact basis explanation and matching P&L link | Medium: avoids implying a full statutory accounting basis |
| Dashboard legend exposes gate_in, pending_verification, transire_processing | Reuse human-readable stage labels consistently | Low: easier training; no calculation change |
| Container header sends Manage in Operations to general /operations, and invoice count to general /invoices | Deep-link to this job or its filtered invoice list; preserve return context | High: fewer searches and wrong-record selections |
| Container detail and Operations expose related information in different places | Common job summary strip and cross-links; one authoritative owner/date per stage | High: reduce confusion without creating duplicate writes |
| Sidebar is hidden in the observed narrow view | Persistent compact branch badge and clearly labelled current workspace | Medium: prevent context loss on small screens |
| Narrow cards stack cleanly but create long pages; B/L wraps heavily in detail header | Compact summaries, full-width identity row, optional expanded detail and clear table drill-down | Medium: less scrolling while keeping full currency values |
| Dark-mode secondary text is visually subdued | Measure contrast in both themes; improve small muted labels where needed | Medium: candidate visual issue, not a measured WCAG failure |
| Global search covers containers, clients and invoices with recents | Add authorized schedules, bank references, documents and report names; saved filters | Medium: build on existing search rather than replace it with AI |
| Tasks/alerts/approvals exist in separate screens | Role-specific Today queue with source links, blockers, due time and escalation | High: make existing functionality actionable |
| Generic stage-owner text can differ in spelling from staff identities | Stage-specific user-ID assignment plus retained display-name history and cover officer | Medium: preserve independence; improve accountability and task linkage |

Acceptance for responsive work should include 360/390px phones, 768px tablets,
1280/1440px desktop, keyboard-only navigation and zoom. Financial values must not
be silently truncated; wide comparison tables may scroll within their own panel,
with primary actions and record identity still accessible. These are proposed
acceptance criteria, not a claim that today's review covered those devices.

## 7. Prioritized Capability Backlog

These IDs are a NEW proposal list, not replacements for historical numbered audit
steps. Priority reflects expected operational value and dependencies, not a
promised return on investment. Effort is a relative engineering judgement:
S = narrow change, M = multi-module work, L = substantial model/integration work.

| ID | Capability | Type | Priority | Effort |
| --- | --- | --- | --- | --- |
| CAP-01 | Unified job overview and role-based daily queue | Improve existing | High | M |
| CAP-02 | Document readiness, expiry, versions and reviewed OCR | Improve existing | High | M-L |
| CAP-03 | Free-time, demurrage, detention and storage forecast | New engine on existing costs | High | M-L |
| CAP-04 | Shipment/B/L parent with container visits | New foundational model | High where required | L |
| CAP-05 | Customer self-service portal | New module | High, after access/document foundations | L |
| CAP-06 | Quotations and versioned commercial agreements | New module on existing costing | Medium-High | M-L |
| CAP-07 | External bank-statement matching and close controls | Improve existing finance | High before substantial real transaction volume | L |
| CAP-08 | Client credit policy and collections worklist | Improve existing AR | Medium-High | M |
| CAP-09 | Transport dispatch and proof of delivery | Improve existing delivery | Medium-High | M-L |
| CAP-10 | Broader tracking and milestone communications | Improve existing integrations | Medium | L |
| CAP-11 | Supplier bills, commitments and reimbursement links | New AP layer on existing payments | Medium | L |
| CAP-12 | Yard inventory, placement and truck appointments | New terminal module | High for yard operators; otherwise defer | L |
| CAP-13 | Customs reference/estimate workspace | New assistance capability | Medium | M-L |
| CAP-14 | Report centre, saved views and KPI explanations | Improve existing | High | M |
| CAP-15 | MFA, recovery and release/restore discipline | Extend security and delivery process | High before wider rollout | M-L |
| CAP-16 | Accounting/FX integration and future business variants | New extensions | Conditional / later | L |

### CAP-01: Unified Job Overview and Daily Queue

**What:** One job summary showing client/B/L/containers, true current physical
stage, independent department milestones, blockers, next responsible person,
documents, budget, paid cost, invoiced amount and collections. A personal Today
queue prioritizes assigned overdue and ready-to-action work.

**Why/benefit:** Staff should not inspect five workspaces to answer what stops one
job progressing. Managers get an actionable queue rather than only activity totals.
Existing Tasks, Pipeline, Notifications and Approvals supply the data.

**Scope/acceptance:** Start with links and a shared read model. Do not create a
second editable stage owner. One task retains one identity across all views;
parallel departmental completion does not falsely imply physical gate presence.
Measure time to locate the next action and missed-assignment counts.

### CAP-02: Document Readiness and Reviewed OCR

**What:** Classify uploads as B/L, assessment, release, permit or receipt; record
required/received/reviewed/rejected/expired status, issuer, expiry, version and
reviewer. Configure requirements by job/cargo type. Add OCR for scans and photos,
with suggested fields shown next to the source page for human acceptance.

**Why/benefit:** A folder containing files does not tell Documentation whether the
right documents are complete and current. This reduces missed prerequisites and
retyping; searchable scans make existing AI retrieval more useful.

**Current boundary:** DocumentsTab supports sections, preview, upload and indexing.
Image extraction explicitly returns unsupported. No structured checklist/expiry
model was found. The manual's instruction to review a checklist is operational
guidance, not evidence that a configurable checklist module already exists.

**Acceptance:** Maintain immutable document versions; never silently replace a
release document. Record confidence and accepted edits. Low-confidence amounts,
identifiers and dates require review; extraction cannot approve a release/payment.
Use representative scans to measure correction rate and extraction quality.

### CAP-03: Free-Time and Delay-Cost Forecasting

**What:** Separate rules for carrier detention/demurrage and terminal storage:
free-time start event, agreed days, calendar basis, tariff bands, currency,
extensions/waivers and responsible payer. Show last free day, days remaining,
estimated accrued amount and forecast if movement occurs later.

**Why/benefit:** Existing charge fields record costs after someone knows them;
forecasting helps Operations decide which container should move first. It can
make an avoidable cost visible before a manager receives the final invoice.

**Example:** A fictional contract grants seven free days and charges NGN20,000
per chargeable day thereafter. The system should show the actual contract's
counting convention and forecast, not assume all ports/carriers follow one rule.
Separate customer-recoverable amounts from company-borne costs.

**Acceptance:** Reviewed tariff versions; test weekend/boundary/extension cases;
link each estimate to its rule and event. Forecasts must not automatically become
paid expenses or issued invoice lines. Match approved final charges separately.

### CAP-04: Shipment Parent, B/L and Container Visits

**What:** A shipment/job owns client, B/L and commercial/document context, with
multiple linked container visits. Container equipment identity is distinct from
its visit on a particular job. Later add master/house B/L only where required.

**Why/benefit:** Current schema makes containerNumber and blNumber individually
unique. An invoice can have several container items, but that does not resolve
multiple boxes under one B/L or the same box returning on a later shipment.

**Safe approach:** First confirm real shipment patterns. Design an additive
migration preserving existing container IDs, financial facts and audit links;
initially map each current record to one job/visit. Do not simply remove unique
constraints and introduce duplicate identities.

**Acceptance:** One B/L with three containers; partial delivery; per-container
costs plus job-level fees without double counting; separate later visit for the
same equipment; strict branch/client isolation. This foundation precedes LCL,
complex portal jobs and yard movement history.

### CAP-05: Customer Self-Service Portal

**What:** A separate client login showing only approved milestones, shared
documents, invoices, statements, balances and document requests. Clients may
submit files or questions for staff review. Start read-only plus uploads before
adding booking requests or online payments.

**Why/benefit:** Give clients a clear answer to where their job is and what they
must provide. Staff can spend less time resending the same information. Portal
patterns are described by [Magaya](https://www.magaya.com/digital-freight-portal/).

**Dependencies/acceptance:** Client-scoped identity and server-side permissions,
revocable invitations, file-level visibility and access logs. Do not give clients
internal Staff accounts. Test that changing an ID cannot reveal another client's
job, invoice or document; internal margins, notes and bank data stay private.
Source update time must be visible; a manually recorded milestone is not GPS.

### CAP-06: Quotes and Commercial Agreements

**What:** Prepare an itemized estimate before job creation: scope, inclusions,
exclusions, validity, currency, taxes, customer advances and expected margin.
Version and approve quotations; convert the accepted version into the job budget
and subsequent invoice draft. Extend today's single agreed clearing rate with
explicit rate conditions only when needed.

**Why/benefit:** Avoid arguments about whether transport, storage or unexpected
charges were included. Sales and Accounts work from the same agreed version.
Quote/rate-to-job patterns appear in [CargoWise](https://www.cargowise.com/solutions/cargowise-forwarding/cargowise-rates-and-contracts/).

**Acceptance:** Accepted quotation stays immutable; changes require a variation;
conversion is idempotent; quote totals never appear as collected cash or issued
revenue. Distinguish agency fees from disbursement estimates.

### CAP-07: Bank Reconciliation and Period Close

**What:** Import an independent bank statement, propose matches to existing app
transactions and let Accounts confirm them. Identify unmatched items, fees,
duplicate imports and timing differences. Retain reconciliation sign-off and
closed-period controls with authorized correction/reopening.

**Why/benefit:** Current bank balances are calculated from app source records;
they do not independently prove what the bank processed. Matching strengthens
trust and catches omissions before management relies on monthly reports.

**Acceptance:** Do not create a second payment for a matched row; retain statement
file/date and source IDs; support reversal/transfer cases; a signed-off period
must balance or show explicit exceptions. Begin with supported CSV formats before
considering a contracted banking API. Current reconciliation reports remain.

### CAP-08: Credit Policy and Collections Worklist

**What:** Per-client payment terms, credit limit, promised-payment date, collector,
dispute reason and approved credit-hold override. Combine eligible unpaid invoices
into a prioritized follow-up queue with configurable reminder preferences.

**Why/benefit:** AR currently tells staff what is owed; the addition coordinates
what they should do about it. Deposits and credit balances are not credit limits.

**Acceptance:** Draft/cancelled/written-off items cannot inflate collectible
exposure. Deposits/credits are shown with correct allocation rules. A hold must
not override mandatory operational or safety procedures; documented management
policy decides which commercial actions require an override.

### CAP-09: Dispatch and Proof of Delivery

**What:** Build on driver/truck/delivery fields with a dispatch order, assigned
driver acknowledgement, arrival/offloading milestones, POD photos/signature,
recipient and empty-return evidence. Add a low-bandwidth mobile interface.

**Why/benefit:** Delivery staff can capture evidence once; customer disputes,
completion checks and billing can reference the same delivery packet. A driver
document/signature pattern is documented by [PortPro](https://help.portpro.io/support/solutions/articles/154000228567-how-to-upload-and-manage-documents-in-the-driver-app).

**Acceptance:** Separate event time and upload time; retain failed upload status;
role-limited access and consent for personal/location information. If offline
capture is added, queue drafts/evidence with conflict handling; do not allow
offline final payment approval or irreversible gate release.

### CAP-10: Broader Tracking and Milestone Communications

**What:** Extend the existing Maersk path and external links with licensed carrier
feeds, selected carrier/booking identity, standardized events, source freshness,
retry handling and customer-approved event notifications.

**Why/benefit:** Avoid entering the same ETA repeatedly; alert owners when a
meaningful event changes. A box prefix is a hint, not a sufficient long-term
identity for the operating carrier. Keep externally reported arrival distinct
from a locally verified release or gate action.

**Acceptance:** Provider credentials/entitlement and Nigerian lane coverage must
be verified before promises. Ingest duplicate events once; retain provenance;
show stale/unavailable data honestly. Reuse communication logs, preferences and
templates; verify sent versus delivered status. Never silently send test messages.
Consider [DCSA event definitions](https://dcsa.org/standards/track-and-trace/standard-documentation-track-and-trace)
without assuming the standard grants access to carrier data.

### CAP-11: Supplier Bills, Commitments and Reimbursement

**What:** Structured supplier profiles and bills with bill number, job/section,
amount, due date, supporting document, approval and linked payment schedule.
Distinguish budget, approved commitment, unpaid bill and actual payment. Track
whether a recoverable disbursement has been included in a customer invoice.

**Why/benefit:** Current vendor-name schedules and expense postings handle money
movement but do not constitute a full supplier subledger. This helps Accounts
forecast liabilities and avoid paying twice or forgetting reimbursable costs.

**Acceptance:** One payment fact referenced by schedule, bill and bank, not three
independent postings. Prevent duplicate supplier invoice references within the
correct scope. Approve allocation rules when one bill covers several jobs.

### CAP-12: Physical Yard and Truck Appointments

**What:** Yard zones/slots, container location, movement orders, occupancy,
seal/condition inspections and booked truck visits. For relevant facilities,
extend to warehouse packages, stripping/stuffing, bond inventory and custodian
handover. Equipment scheduling, weighbridge/OCR/RFID can be later integrations.

**Why/benefit:** If you operate a bonded terminal, knowing a container passed the
gate is not enough to know where it is stored or which move is needed next.
This distinction is illustrated by [Kaleris TOS scope](https://kaleris.com/solutions/terminal-operating-system/).

**Acceptance:** Confirm site layout, capacity and actual operating rules first.
Prevent incompatible/double slot assignments; trace every move; maintain manual
fallback and physical inventory checks. Integrate with existing gate readiness
controls, not a competing release workflow. If you only use other terminals,
prioritize visibility integration instead of building an unnecessary yard module.

### CAP-13: Customs Reference and Estimate Assistance

**What:** Save commodity/HS classification suggestions, declared values, freight,
insurance and references supporting a reviewed duty estimate; compare against
the official assessed and paid amounts already recorded in Duty Payments.

**Why/benefit:** Improve early customer budgeting and Documentation preparation
without pretending internal calculations replace official assessment.

**Acceptance:** Current authorized tariff source, version/effective date, rate
provenance and responsible reviewer. Preserve estimate, assessment and payment as
different facts. Start with reference links and approved imports; direct filing
requires documented agency authorization and integration access. Nigeria's
[official trade portal](https://tip.nsw.gov.ng/) provides relevant reference tools,
but this review did not establish a public application filing API or integration
entitlement. No tax rate or filing compliance is certified here.

### CAP-14: Report Centre and Explained KPIs

**What:** Searchable report catalogue, favourites, saved branch/date/basis presets,
dedicated report pages, generated-at stamps, source drill-down and a consistent
preview/export flow. Expand approved subscriptions beyond their current two types
only after each report's period and recipient rules are clear.

**Why/benefit:** The app already has useful reporting. The problem is learning
which report answers a question and why two legitimately different totals differ.

**Acceptance:** Display data population, date field, branch and basis on screen
and exports. Saved filters cannot bypass access. KPIs include stage turnaround,
cost variance, document readiness and eventually free-time risk, each with a
definition. Never “fix” differing bases by forcing their numbers to match.

### CAP-15: Security, Recovery and Release Discipline

**What:** MFA for privileged users, recovery codes, clear session/revocation
management and an administrator permission preview. Extend the existing isolated
tests with automated route-contract/browser smoke tests and documented restore
exercises for both database and uploaded documents.

**Why/benefit:** More users, customer access and integrations increase the impact
of mistakes. The Stage Notes finding shows why UI-to-route contract tests matter
even when earlier selected live tests passed.

**Current boundary:** Existing authentication, CSRF, branch permissions, audit
history, backups/checkpoints and isolated testing must be preserved. No wired MFA
flow was found; a generic OTP UI component is not evidence of active MFA. This
review did not execute restore tests or inspect every production secret/config.

**Acceptance:** Recovery cannot bypass authority checks. Test password/MFA recovery
and revoked sessions. Staging must isolate DB, files and outbound sends; record
release commit and check result. A green build is not alone live acceptance.

### CAP-16: Accounting/FX and Broader Service Variants

**What:** If business demand supports it, add an accounting-system connector,
multi-currency invoice/settlement treatment, job WIP/accrual policies and eventually
export, air, LCL or agent-settlement workflows. Do not assume the existing USD/NGN
charge conversion is complete multi-currency accounting.

**Why/benefit:** These support a larger forwarder, but can create unnecessary
complexity for a focused clearing operation. [GoFreight](https://gofreight.com/product/freight-billing-accounting/)
provides a useful wider accounting comparison.

**Acceptance:** Agree the accounting policy with the responsible accountant;
choose integration versus building a full ledger before designing accounts,
journals, trial balance and FX revaluation. Preserve immutable source links and
reconcile opening balances. Expand job variants only after CAP-04 and real
workflow examples. Multi-company SaaS tenancy is a separate future product project,
not something achieved by adding more branches.

## 8. Suggested Delivery Order

No phase below is approved or implemented simply because it appears here.

1. **Repair observed friction:** REVIEW-NOTES-001, REVIEW-A11Y-001 and
   REVIEW-LABEL-001; contextual links and plain-language labels. Add regression
   checks and keep old acceptance history intact.
2. **Clarify foundations:** agree job/B/L/visit relationships and target business
   scope. Implement CAP-04 first if multi-container B/Ls or repeat visits are
   required. Establish CAP-15 release/security foundations alongside this.
3. **Prevent avoidable work and costs:** CAP-01, CAP-02 and CAP-03, plus the first
   searchable/report-navigation slice of CAP-14. These build on daily operations.
4. **Strengthen financial control:** CAP-07 and CAP-08, then CAP-06/CAP-11 according
   to quote volume and supplier-payment complexity.
5. **Improve customer/field service:** a tightly scoped CAP-05 portal, CAP-09 POD
   and selected CAP-10 integrations. Expand only after isolation/evidence tests.
6. **Choose the industry expansion:** CAP-12 becomes an early priority if you
   operate the physical yard. CAP-13/CAP-16 follow proven demand and access.

If selecting only three product investments after repairs, choose document
readiness, free-time forecasting and the unified job overview. If reducing client
status calls is the dominant problem, move a read-only customer portal ahead of
quotes and advanced tracking. If the business operates the bonded yard itself,
yard inventory outranks customer-facing polish.

## 9. What We Should Not Do

- Do not rebuild invoices, duty payments, bank posting or departmental ownership
  merely because another vendor lists the same capability.
- Do not add unrestricted AI actions, automatic customs submission or automatic
  financial posting from OCR. Preserve human review and evidence.
- Do not implement a large TOS, full ERP, payroll, marketplace, blockchain or
  numerous transport modes without a concrete business case.
- Do not treat marketing savings or feature counts as proof of product quality.
- Do not silently migrate historical B/Ls, fabricate missing transaction evidence
  or delete test fixtures to make new reports look cleaner.
- Do not claim the entire application is defect-free, legally compliant or fully
  accessible based on this review or the earlier bounded acceptance tests.

## 10. Implementation Decision Checklist

Before approving a feature, record the user problem, responsible department,
source of truth, permissions, data model, required integrations and recurring
costs. Provide one normal example and one failure/reversal example. Agree the
acceptance tests, migration/rollback plan and measurable user benefit.

Recommended measures are task completion time, missed deadline count, document
rework, customer status enquiries, unmatched bank items and controlled error rate.
Establish a baseline before making numerical improvement promises.

## 11. Reproducible Source Map

Paths below are repository-relative for portability. They identify review evidence,
not a claim that every line in every file was independently audited today.

| Evidence | Repository source |
| --- | --- |
| Current closures and reconciliation | docs/PROJECT_STATE.md; docs/LIVE_E2E_TEST_REGISTER.md; docs/SESSION_SUMMARIES/2026-09-08-legacy-schedule-reconciliation.md |
| Operating scope and finance definitions | docs/manual/APPLICATION_MANUAL.md, chapters 8-9, 36-43 |
| Frontend/API module inventory | artifacts/cost-analysis/src/App.tsx; artifacts/api-server/src/routes/index.ts |
| Job identity, owners, dates and gate fields | lib/db/src/schema/containers.ts:7 |
| Duplicate identity rejection | artifacts/api-server/src/routes/containers.ts:637 |
| Client agreements and credit fields | lib/db/src/schema/clients.ts:6 |
| Document metadata | lib/db/src/schema/documents.ts:8; document-intelligence.ts in the same directory |
| Upload/search/preview UI | artifacts/cost-analysis/src/components/containers/DocumentsTab.tsx:38 |
| Image OCR unsupported | artifacts/api-server/src/lib/document-intelligence.ts:86 |
| Notes contract mismatch | lib/api-client-react/src/stage-notes.ts:14; artifacts/api-server/src/routes/containers.ts:2817 and :2843; routes/index.ts:35 |
| Notes unsafe list use | artifacts/cost-analysis/src/pages/containers/[id].tsx:86 |
| Documentation semantics and labels | artifacts/cost-analysis/src/pages/workspace/documentation.tsx:165 and :202 |
| Contextual navigation | artifacts/cost-analysis/src/pages/containers/[id].tsx:1977 and :1998 |
| Invoice summary eligibility | artifacts/cost-analysis/src/pages/invoices/index.tsx:179 and :215 |
| Global search scope | artifacts/cost-analysis/src/components/layout/global-search.tsx:47 |
| Tracking scope | artifacts/api-server/src/routes/tracking.ts:121; artifacts/cost-analysis/src/lib/tracking.ts |
| Communication scope | artifacts/api-server/src/lib/whatsapp.ts:39; lib/db/src/schema/whatsapp.ts |
| Report calculations/catalogue | artifacts/api-server/src/routes/reports.ts; artifacts/cost-analysis/src/pages/reports/index.tsx |
| Bank transaction scope | artifacts/api-server/src/routes/banks.ts |
| Current access schema | lib/db/src/schema/users.ts; artifacts/api-server/src/lib/auth.ts |
| Existing isolated test command | package.json; scripts/run-isolated-integration-tests.mjs |

Public sources are linked next to the claims they support above and were consulted
on 2026-09-08. They describe vendor/reference capabilities, not features added to
this repository. Session continuity is in
docs/SESSION_SUMMARIES/2026-09-08-capability-review.md.
