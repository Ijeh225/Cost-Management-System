# AI Natural-Language Assistant Roadmap

## Goal

Evolve the existing AI Assistant from a controlled keyword/tool console into a natural-language copilot for authorised `admin` and `super_admin` users.

The assistant must understand ordinary questions, retrieve only permission-scoped live data through approved backend tools, explain its answer clearly, cite the source records, and never make a sensitive change without an explicit confirmation and the user’s normal application permission.

## Non-Negotiable Controls

- The AI model never receives unrestricted database access.
- The backend remains the policy enforcement point for roles, branch scope, limits, and validation.
- Every read tool, response, generated document, proposed action, confirmation, and completed action is retained in the existing AI audit trail.
- Answers must be based on tool output. When evidence is incomplete, the assistant must say so rather than guess.
- Financial approvals, payments, deletes, workflow transitions, and external messages remain draft-and-confirm actions.
- Branch-scoped admins see only their branch. Super admins see only the branch scope intentionally selected for the request, or an explicitly authorised all-branch report.

## Phase 1 - Correct Business Definitions

### Objective

Make the assistant and dashboard use the same business meanings before making the assistant more conversational.

### Work

- Split the current combined terminal-workflow metric into separate facts:
  - Currently in Terminal (`terminal` only)
  - Awaiting Pullout (`pull_out` only)
  - Examination (`examination` only)
  - Final Release (`final_release` only)
- Review every assistant tool against the equivalent page/dashboard calculation.
- Create a shared business-definition catalogue for stage names, payment statuses, overdue rules, and branch metrics.
- Add tests proving each status is counted only in its correct category.

### Exit Criteria

- “How many jobs are in Terminal?” matches the Dashboard exactly.
- Similar stage, invoice, overhead, and payment figures match their source modules.

## Phase 2 - Expand Approved Read Tools

### Objective

Give the assistant enough safe backend capabilities to answer common questions without raw SQL or unrestricted search.

### New Tools

- `get_stage_count(stage)`
- `list_stage_jobs(stage, status, limit)`
- `find_stage_delays(stage, overdueDays)`
- `get_container_status(containerNumberOrId)`
- `get_container_payment_history(containerId)`
- `get_invoice_status(invoiceNumberOrId)`
- `get_overhead_summary(filters)`
- `get_payment_schedule_summary(filters)`
- `get_client_balance(clientNameOrId)`
- `get_branch_performance(period, branchIds)`
- `get_notifications_summary(filters)`
- `get_document_references(containerId, query)`

### Rules

- Each tool has a typed input schema, maximum result count, branch check, role check, and source links.
- Tools return structured facts and records, not free-form prose.
- The assistant has no tool that runs arbitrary database queries.

### Exit Criteria

- Common finance and operational questions can be answered through explicit, tested tools.
- Every result contains direct links to the underlying application records.

## Phase 3 - Natural-Language Tool Selection

### Objective

Replace rigid keyword matching with LLM-assisted intent recognition and safe tool calling.

### Work

- Add an AI provider adapter with the API key stored only in Railway variables.
- Send the model a constrained tool schema, the user’s role, selected branch scope, and a short system policy.
- Require structured tool-call output; reject any tool name or argument that fails server-side validation.
- Add a clarification flow when the question is ambiguous.

### Examples

- “How many jobs are in Shipping?” -> `get_stage_count({ stage: "shipping" })`
- “What is waiting for DO release?” -> `list_stage_jobs({ stage: "shipping", status: "active" })`
- “Which containers are overdue?” -> `find_stage_delays({ stage: "all" })`
- “Show unpaid overhead for SA this month.” -> `get_overhead_summary({ person: "SA", period: "this_month", paymentStatus: "unpaid" })`

### Exit Criteria

- Different normal ways of asking the same question select the same correct approved tool.
- Unsupported or unclear questions receive a useful clarification, not a misleading answer.

## Phase 4 - Evidence-Based Answer Generation

### Objective

Make answers useful to management without turning calculations into unverifiable AI opinions.

### Work

- Pass only validated tool results to the model for summarisation.
- Require answers to distinguish facts, calculations, assumptions, and recommendations.
- Add a consistent answer layout:
  - Direct answer
  - Key figures
  - Affected records
  - Suggested next steps
  - Sources and links
- Add a confidence/evidence notice when data is missing, stale, or incomplete.

### Exit Criteria

- Every financial or operational statement can be traced to records returned by a tool.
- The assistant does not invent dates, totals, owners, statuses, or explanations.

## Phase 5 - Conversational Context

### Objective

Allow useful follow-up questions without leaking data between users or branches.

### Work

- Store short, permission-scoped conversation context in the existing AI session tables.
- Support safe follow-ups such as:
  - “Show the overdue ones.”
  - “Which branch has the highest amount?”
  - “Open the first container.”
- Expire context after a short inactivity window.
- Re-check role and branch access on every follow-up, not only at the start of the chat.

### Exit Criteria

- Follow-ups work naturally but never reuse a record outside the current user’s authorisation.

## Phase 6 - Report and Document Requests

### Objective

Let the assistant prepare controlled management outputs from approved data.

### Work

- Add report-request tools for monthly finance, receivables, branch performance, delays, and payment schedules.
- Generate drafts with report filters, totals, sources, and timestamp.
- Allow authorised users to preview, print, or export approved report formats.
- Keep generated report metadata and source references in the AI audit trail.

### Exit Criteria

- “Prepare this month’s revenue and expense report” produces a reviewable, traceable draft.

## Phase 7 - Controlled Assisted Actions

### Objective

Allow the assistant to prepare actions, while people and existing permissions remain responsible for execution.

### Work

- Support action drafts only, such as a payment reminder, internal follow-up task, debit-note draft, or reschedule proposal.
- Show the full proposed change, affected record, and reason before confirmation.
- Require CSRF protection, existing role checks, branch checks, and a separate explicit confirmation.
- Re-use existing normal API endpoints for the final action; never let the model mutate data directly.

### Exit Criteria

- A user can ask for a draft, review it, and explicitly confirm it; the audit trail shows the full chain.

## Phase 8 - Evaluation, Monitoring, and Rollout

### Objective

Prove accuracy, safety, usefulness, and cost control before broad internal use.

### Work

- Build a protected evaluation set of real-world but anonymised questions and expected tool/results.
- Test branch isolation, role restrictions, prompt injection resistance, unsafe action attempts, ambiguous wording, and accounting calculations.
- Add monitoring for tool failures, unsupported questions, latency, provider cost, and user feedback.
- Roll out in stages:
  - Super admins only
  - Selected admins
  - All authorised admins
- Add a kill switch in Settings to disable natural-language provider requests while leaving existing report tools intact.

### Exit Criteria

- The business accepts documented accuracy and security thresholds.
- The assistant can be disabled immediately without affecting normal application workflows.

## Delivery Order

1. Phase 1: Correct business definitions.
2. Phase 2: Complete safe read-tool coverage.
3. Phase 3: Natural-language tool selection.
4. Phase 4: Evidence-based answer generation.
5. Phase 5: Conversation context.
6. Phase 6: Reports and document requests.
7. Phase 7: Controlled assisted actions.
8. Phase 8: Evaluation and staged rollout.

## Railway Configuration Needed Later

- AI provider API key, stored as a Railway secret.
- Optional provider/model configuration variables.
- Usage and budget limit variables.
- No database password, object-storage secret, or general production secret should ever be included in a model prompt.

## Success Definition

An authorised manager can ask plain-English questions about the business, receive accurate answers based on live authorised records, open the exact records behind the answer, and prepare controlled next steps. The assistant remains an adviser and drafting helper; staff retain responsibility for verification, approvals, and final changes.
