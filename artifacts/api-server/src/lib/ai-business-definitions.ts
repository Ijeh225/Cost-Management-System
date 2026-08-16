/**
 * Canonical business language for the AI assistant.
 *
 * This is a glossary of application rules, not a data source. Live facts still
 * come only from approved, branch-scoped tools. Keep new terms here when a
 * feature introduces vocabulary that could otherwise be interpreted wrongly.
 */
export type AiBusinessDefinitionCategory =
  | "access"
  | "operations"
  | "workflow"
  | "finance"
  | "documents"
  | "reporting"
  | "notifications"
  | "ai";

export type AiBusinessDefinition = {
  term: string;
  aliases: string[];
  category: AiBusinessDefinitionCategory;
  definition: string;
};

export const AI_BUSINESS_DEFINITIONS: readonly AiBusinessDefinition[] = [
  // Access, accountability, and organisation
  { term: "Branch scope", aliases: ["my branch", "selected branch", "all branches"], category: "access", definition: "Every answer is limited to the logged-in user's authorised branch scope. Super Admin can use an all-branches scope; other users are limited to their own branch." },
  { term: "Super Admin", aliases: ["super administrator"], category: "access", definition: "The highest application role. It configures global settings, branch-wide controls, and AI rollout, but normal workflow permissions still apply where an officer is assigned." },
  { term: "Admin", aliases: ["administrator", "MD"], category: "access", definition: "An authorised branch administrator. Admin access is branch-scoped unless the user is also a Super Admin." },
  { term: "Department user", aliases: ["documentation user", "transire user", "shipping user", "terminal user", "pullout user", "accounts user"], category: "access", definition: "A user focused on their assigned department workspace. Department visibility and alerts are limited to the user's relevant work." },
  { term: "Audit trail", aliases: ["audit log", "history"], category: "access", definition: "A permanent record of important user actions, including actor, date, time, and action details. It supports accountability; it is not a substitute for the source record." },
  { term: "Approval queue", aliases: ["approval", "admin review"], category: "access", definition: "The management queue for items awaiting an authorised review or decision. Approval is distinct from recording an actual payment or operational completion." },

  // Core records and container operations
  { term: "Job / container", aliases: ["job", "container record", "shipment"], category: "operations", definition: "One shared container record that links customer, vessel, workflow, documents, charges, payments, tasks, and audit history." },
  { term: "B/L", aliases: ["BL", "bill of lading", "bill lading"], category: "operations", definition: "The Bill of Lading reference stored on the container record. It identifies shipping documentation but is not itself a release confirmation." },
  { term: "Verification", aliases: ["verify container", "awaiting verification"], category: "operations", definition: "The controlled intake check for a new container. A container awaits verification until an assigned Verification Officer verifies it; verification records the responsible user and time." },
  { term: "Verification Officer", aliases: ["verifier"], category: "operations", definition: "One or more users selected in Settings who may verify assigned or fallback pending containers. Other users can see the status but cannot verify." },
  { term: "Vessel ETA", aliases: ["ETA", "arrival date", "revised ETA"], category: "operations", definition: "The expected vessel arrival or berthing date. ETA is a plan and may be revised; it is not proof that the vessel has berthed." },
  { term: "Berthing", aliases: ["vessel berthed", "berthed at port", "berthing confirmation"], category: "operations", definition: "Confirmation that the vessel has berthed at the port. It is recorded only by an assigned Berthing Officer and is separate from ETA." },
  { term: "Berthing Officer", aliases: ["berthing confirmation officer"], category: "operations", definition: "One or more users selected in Settings who may confirm berthing or revise a berthing ETA. Other users have read-only visibility." },
  { term: "In terminal", aliases: ["at terminal", "physically in terminal", "containers in terminal"], category: "operations", definition: "A container physically present in the terminal: it is at Gate-In, Examination, or Final Release and has not been gate-out. It is not the Terminal/TDO department queue and does not include Pullout." },
  { term: "Gate-In", aliases: ["gate in", "gate-in date"], category: "operations", definition: "The operational state after a container has entered the terminal gate. It counts as physically in the terminal until gate-out." },
  { term: "Examination", aliases: ["exam", "customs examination"], category: "operations", definition: "The physical terminal workflow state for examination. It counts as physically in the terminal until gate-out." },
  { term: "Final Release", aliases: ["final released"], category: "operations", definition: "A physical terminal workflow state after final release. It still counts as physically in the terminal until gate-out." },
  { term: "Delivery / Empty Return", aliases: ["delivery", "empty return"], category: "operations", definition: "Downstream delivery work and, where applicable, return of the empty container. These are later operational records, not evidence that finance or earlier departmental work is complete." },

  // Parallel departmental workflow
  { term: "Early-stage departments", aliases: ["parallel departments", "early workflow"], category: "workflow", definition: "After verification, Documentation, Transire, Shipping, and Terminal/TDO work independently on the same container. Completing one department does not remove the container from another department's active work." },
  { term: "Documentation / PAAR", aliases: ["documentation", "PAAR number", "PAAR release"], category: "workflow", definition: "Documentation remains active until a PAAR number is recorded. Saving documentation without PAAR keeps it active; entering PAAR submits Documentation. The PAAR release date can be recorded with the PAAR number." },
  { term: "Transire release", aliases: ["transire", "actual transire release", "expected transire date"], category: "workflow", definition: "Transire is complete only when its actual release date is recorded. An expected Transire date is a planned date and keeps the job active." },
  { term: "Shipping / DO release", aliases: ["shipping", "DO", "delivery order", "DO release", "expected DO date"], category: "workflow", definition: "Shipping is complete only when the actual Delivery Order release date is recorded. An expected DO date is a planned date and keeps the job active." },
  { term: "Terminal / TDO release", aliases: ["Terminal/TDO", "TDO", "terminal department", "TDO release", "expected TDO date"], category: "workflow", definition: "The Terminal department Delivery Order workflow. It is complete only when the actual TDO release date is recorded. This queue is different from physical terminal presence." },
  { term: "Pullout release", aliases: ["pullout", "pull out", "actual pullout date", "expected pullout date"], category: "workflow", definition: "Pullout becomes available after Terminal/TDO release and is complete only when the actual Pullout release date is recorded. An expected Pullout date is planned work and keeps it active." },
  { term: "Released", aliases: ["completed", "actual completion"], category: "workflow", definition: "For a department, released means its actual completion or release date has been recorded. It does not mean the whole container workflow is complete." },
  { term: "Expected date", aliases: ["due date", "planned date"], category: "workflow", definition: "A planned target date for a stage. Saving an expected date does not release or complete that stage." },
  { term: "Delay", aliases: ["overdue stage", "late job", "stalled job"], category: "workflow", definition: "A stage is delayed when its expected date has passed and its actual release date is still empty. A delay reason and stage owner explain responsibility and follow-up." },
  { term: "Terminal Manager review", aliases: ["terminal manager"], category: "workflow", definition: "A downstream management review workspace after the required operational work is ready. It is separate from the Terminal/TDO department's release task." },

  // Financial management
  { term: "Charges", aliases: ["clearing charges", "cost"], category: "finance", definition: "Charge lines recorded against a container, grouped into shipping, customs, terminal, delivery, operations, and additional charges. Charges are not automatically cash payments." },
  { term: "Container payment", aliases: ["container disbursement", "expense payment"], category: "finance", definition: "An actual payment recorded against container-related cost. It may have a cash or bank source and contributes to payment history and financial reporting." },
  { term: "Duty payment", aliases: ["customs duty", "duty"], category: "finance", definition: "A customs duty assessment or payment record. Its paid, partial, unpaid, or not-assessed status refers to duty, not necessarily to all container charges." },
  { term: "Invoice", aliases: ["customer invoice", "billing"], category: "finance", definition: "A bill issued to a client from invoice items. Invoice status can be draft, sent, partial, paid, overdue, or written off and is separate from internal cost payments." },
  { term: "Receivables", aliases: ["accounts receivable", "AR", "client balance"], category: "finance", definition: "Amounts the company expects to collect from clients, based on invoices, actual invoice payments, credits, and deposits." },
  { term: "Outstanding", aliases: ["balance due", "unpaid balance"], category: "finance", definition: "The unpaid balance based on actual recorded payments. MD-approved but unpaid scheduled amounts remain separate and do not reduce the balance." },
  { term: "Partial payment", aliases: ["part payment", "partially paid"], category: "finance", definition: "An actual payment smaller than the current balance. It reduces the balance and leaves the record in a partial status until fully settled." },
  { term: "Client wallet / deposit", aliases: ["wallet", "client deposit", "unallocated deposit", "credit balance"], category: "finance", definition: "Funds received from a client that may be applied to invoices. A deposit not yet linked to an invoice is unallocated; it is not revenue until correctly applied under the accounting workflow." },
  { term: "Credit note", aliases: ["invoice credit"], category: "finance", definition: "A documented reduction against an invoice. It is not a cash refund unless a separate approved refund process records one." },
  { term: "Payment schedule", aliases: ["scheduled payment", "MD payment request"], category: "finance", definition: "An internal request for MD approval and payment tracking. It can be manual or linked to an overhead expense. A schedule is not a payment until Accounts records an actual payment." },
  { term: "Approved pending payment", aliases: ["MD approved", "awaiting payment"], category: "finance", definition: "An amount approved by MD but not yet paid. It is visible for follow-up but does not reduce an expense or invoice balance until actual payment is recorded." },
  { term: "Overhead expense", aliases: ["overhead", "office expense"], category: "finance", definition: "A business operating cost record. It remains the accounting source record; direct Pay Now and linked scheduled payments both write actual payments into its payment history." },
  { term: "Money added", aliases: ["overhead topup", "expense topup"], category: "finance", definition: "An increase to an existing overhead expense amount, with its own description and history. It increases the total expense but is not a payment." },
  { term: "Bank account", aliases: ["bank", "cash source", "payment source"], category: "finance", definition: "An internal bank or cash source used to record actual payments, fund additions, or transfers. The bank ledger is an internal record and does not independently confirm an external bank statement." },
  { term: "Bank reconciliation", aliases: ["ledger reconciliation", "reconcile bank"], category: "finance", definition: "A comparison of internally recorded bank inflows, outflows, transfers, and balances. It identifies records needing review; it is not confirmation against an imported bank statement unless that statement is available." },

  // Documents, coordination, and management information
  { term: "Document attachment", aliases: ["uploaded document", "file", "attachment"], category: "documents", definition: "A file attached to a container or payment schedule and stored in configured private object storage. Users can view or download it only when their branch and record access permit it." },
  { term: "Document intelligence", aliases: ["indexed document", "document search", "OCR"], category: "documents", definition: "Extracted readable document text used for permission-scoped search. A file may exist before indexing finishes; unreadable or failed files may not be searchable but remain attachments." },
  { term: "Task", aliases: ["container task", "follow-up"], category: "documents", definition: "An internal work item linked to a container, with assignee, priority, due date, notes, and status. It does not itself change the container workflow stage." },
  { term: "Notification", aliases: ["alert", "workflow event", "bell alert"], category: "notifications", definition: "A stored workflow or system message for an authorised recipient. Notifications deep-link to their related record but do not grant access beyond the recipient's existing permissions." },
  { term: "Email alert", aliases: ["email digest", "email notification"], category: "notifications", definition: "A configurable operational email for selected recipients and frequency, such as terminal jobs, delays, ageing, or financial alerts. It is a summary/reminder, not a replacement for in-app workflow controls." },
  { term: "Dashboard", aliases: ["overview"], category: "reporting", definition: "A live summary of the current authorised branch scope. Dashboard metrics use their own published definitions, such as physical Containers in Terminal." },
  { term: "Analytics / branch comparison", aliases: ["analytics", "branch performance"], category: "reporting", definition: "Management reports that compare authorised branches using recorded operational and financial data. Comparisons should state the selected period and branch scope." },
  { term: "Report", aliases: ["management report", "financial report", "statement"], category: "reporting", definition: "A read-only presentation of live authorised data and calculations. A report draft must cite its source records and be reviewed before external use." },

  // AI boundary
  { term: "AI Assistant", aliases: ["copilot", "AI"], category: "ai", definition: "An Admin/Super Admin assistant that answers with approved, branch-scoped data tools and cited records. It does not have unrestricted database access." },
  { term: "AI evidence", aliases: ["cited records", "source records"], category: "ai", definition: "The facts and direct record links used to support an AI answer. When evidence is missing, the assistant must say it cannot confirm the answer safely." },
  { term: "AI action draft", aliases: ["draft action", "assisted action"], category: "ai", definition: "A proposed internal action such as a task or payment-schedule draft. It requires explicit human confirmation and the normal permission checks before execution." },
] as const;

export type AiOperationalStage = "transire_processing" | "shipping" | "terminal" | "pull_out";

const STAGE_PATTERNS: Array<{ stage: AiOperationalStage; pattern: RegExp }> = [
  { stage: "transire_processing", pattern: /\btransire\b/i },
  { stage: "shipping", pattern: /\bshipping\b|\bdelivery order\b|\bdo release\b|\bexpected do\b/i },
  { stage: "terminal", pattern: /\btdo\b|\bterminal\s*(?:\/|and)\s*tdo\b|\bterminal department\b|\bexpected tdo\b/i },
  { stage: "pull_out", pattern: /\bpull[ -]?out\b/i },
];

const ALWAYS_RELEVANT_CATEGORIES = new Set<AiBusinessDefinitionCategory>(["access", "ai"]);

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function definitionText(definition: AiBusinessDefinition): string {
  return `${definition.term}: ${definition.definition}`;
}

/** Returns the whole maintained glossary for administration, review, and tests. */
export function getAiBusinessDefinitionsPrompt(): string {
  return AI_BUSINESS_DEFINITIONS.map(definitionText).join(" ");
}

/**
 * Only sends relevant terms to the routing model. The full glossary remains
 * available above, but this avoids adding unrelated finance and workflow text
 * to every question and reduces routing cost.
 */
export function getRelevantAiBusinessDefinitionsPrompt(question: string): string {
  const query = normalise(question);
  const matches = AI_BUSINESS_DEFINITIONS.filter((definition) => {
    if (ALWAYS_RELEVANT_CATEGORIES.has(definition.category)) return true;
    const terms = [definition.term, ...definition.aliases].map(normalise).filter(Boolean);
    return terms.some((term) => query.includes(term));
  });
  const selected = matches.length ? matches : AI_BUSINESS_DEFINITIONS.filter((definition) => definition.category === "operations" || definition.category === "workflow");
  return selected.map(definitionText).join(" ");
}

export function resolveAiOperationalStage(question: string): AiOperationalStage | null {
  return STAGE_PATTERNS.find(({ pattern }) => pattern.test(question))?.stage ?? null;
}

export function isPhysicalTerminalPresenceQuestion(question: string): boolean {
  const normalisedQuestion = question.trim().toLowerCase().replace(/\s+/g, " ");
  const refersToTerminalLocation = /\b(?:in|at) (?:the )?terminal\b/.test(normalisedQuestion);
  const asksAboutJobsOrContainers = /\b(?:how many|count|list|show|which|job|jobs|container|containers)\b/.test(normalisedQuestion);
  const explicitlyRefersToDepartmentQueue = resolveAiOperationalStage(normalisedQuestion) === "terminal";
  return refersToTerminalLocation && asksAboutJobsOrContainers && !explicitlyRefersToDepartmentQueue;
}
