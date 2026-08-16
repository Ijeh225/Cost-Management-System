export type ConversationRecordKind = "container" | "invoice" | "client" | "report" | "payment_schedule" | "overhead_expense" | "bank" | "other";

export type ConversationRecordReference = {
  id: number | null;
  title: string;
  href: string;
  kind: ConversationRecordKind;
};

export type AiConversationFocus = {
  containerId: number | null;
  invoiceId: number | null;
  clientId: number | null;
  stage: string | null;
  timeframe: { from: string; to: string } | null;
};

export type AiConversationContext = {
  version: 2;
  branchId: number | null;
  lastToolId: string;
  lastToolArgs: Record<string, unknown>;
  records: ConversationRecordReference[];
  focus: AiConversationFocus;
  updatedAt: string;
};

export type ContextFollowUp = {
  toolId: string;
  args: Record<string, unknown>;
  label: string;
};

function dateKey(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function safeInternalReference(href: string): { kind: ConversationRecordKind; id: number | null; href: string } | null {
  const container = href.match(/^\/containers\/(\d+)(?:[?#].*)?$/);
  if (container) return { kind: "container", id: Number(container[1]), href };
  const invoice = href.match(/^\/invoices\/(\d+)(?:[?#].*)?$/);
  if (invoice) return { kind: "invoice", id: Number(invoice[1]), href };
  const client = href.match(/^\/accounts-receivable(?:\?[^#]*\bclient=(\d+)[^#]*)?$/);
  if (client) return { kind: "client", id: client[1] ? Number(client[1]) : null, href };
  const paymentSchedule = href.match(/^\/payment-schedules(?:\?[^#]*\b(?:selected|focus)=(\d+)[^#]*)?$/);
  if (paymentSchedule) return { kind: "payment_schedule", id: paymentSchedule[1] ? Number(paymentSchedule[1]) : null, href };
  const overheadExpense = href.match(/^\/overhead-expenses(?:\?[^#]*\bexpenseId=(\d+)[^#]*)?$/);
  if (overheadExpense) return { kind: "overhead_expense", id: overheadExpense[1] ? Number(overheadExpense[1]) : null, href };
  const bank = href.match(/^\/banks(?:\?[^#]*\bbankId=(\d+)[^#]*)?$/);
  if (bank) return { kind: "bank", id: bank[1] ? Number(bank[1]) : null, href };
  if (/^\/(?:reports|branch-comparison|notifications|documentation|transire|shipping|terminal|pull-out)(?:[?#].*)?$/.test(href)) {
    return { kind: href.startsWith("/reports") ? "report" : "other", id: null, href };
  }
  return null;
}

function safeRecordReference(value: unknown): ConversationRecordReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ConversationRecordReference>;
  if (typeof record.title !== "string" || typeof record.href !== "string") return null;
  const title = record.title.trim().replace(/\s+/g, " ").slice(0, 160);
  const internal = safeInternalReference(record.href.trim());
  if (!title || !internal || (internal.id != null && (!Number.isInteger(internal.id) || internal.id <= 0))) return null;
  return { id: internal.id, title, href: internal.href, kind: internal.kind };
}

function sanitiseToolArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const args = value as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  if (typeof args.stage === "string" && /^[a-z_]{2,64}$/.test(args.stage)) safe.stage = args.stage;
  if (args.status === "active" || args.status === "released" || args.status === "all") safe.status = args.status;
  const from = dateKey(args.from);
  const to = dateKey(args.to);
  if (from && to && from <= to) { safe.from = from; safe.to = to; }
  for (const key of ["containerId", "invoiceId", "clientId"] as const) {
    const id = Number(args[key]);
    if (Number.isInteger(id) && id > 0) safe[key] = id;
  }
  if (typeof args.containerNumber === "string" && /^[A-Z]{4}\d{7}$/.test(args.containerNumber.trim().toUpperCase())) {
    safe.containerNumber = args.containerNumber.trim().toUpperCase();
  }
  if (typeof args.invoiceNumber === "string" && args.invoiceNumber.trim().length <= 80) safe.invoiceNumber = args.invoiceNumber.trim();
  if (typeof args.clientName === "string" && args.clientName.trim().length >= 2 && args.clientName.trim().length <= 160) safe.clientName = args.clientName.trim();
  const limit = Number(args.limit);
  if (Number.isInteger(limit) && limit > 0 && limit <= 50) safe.limit = limit;
  return safe;
}

function deriveFocus(records: ConversationRecordReference[], args: Record<string, unknown>): AiConversationFocus {
  const first = (kind: ConversationRecordKind) => records.find((record) => record.kind === kind && record.id != null)?.id ?? null;
  const containerId = Number(args.containerId);
  const invoiceId = Number(args.invoiceId);
  const clientId = Number(args.clientId);
  const from = dateKey(args.from);
  const to = dateKey(args.to);
  return {
    containerId: Number.isInteger(containerId) && containerId > 0 ? containerId : first("container"),
    invoiceId: Number.isInteger(invoiceId) && invoiceId > 0 ? invoiceId : first("invoice"),
    clientId: Number.isInteger(clientId) && clientId > 0 ? clientId : first("client"),
    stage: typeof args.stage === "string" ? args.stage : null,
    timeframe: from && to && from <= to ? { from, to } : null,
  };
}

export function parseAiConversationContext(value: string | null, branchId: number | null, allowedToolIds: Set<string>): AiConversationContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Omit<AiConversationContext, "version">> & { version?: number };
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      parsed.branchId !== branchId ||
      typeof parsed.lastToolId !== "string" || !allowedToolIds.has(parsed.lastToolId) ||
      !parsed.lastToolArgs || typeof parsed.lastToolArgs !== "object" || Array.isArray(parsed.lastToolArgs) ||
      !Array.isArray(parsed.records) ||
      typeof parsed.updatedAt !== "string" || Number.isNaN(new Date(parsed.updatedAt).getTime())
    ) return null;
    const records = parsed.records.map(safeRecordReference);
    if (records.some((record) => !record)) return null;
    const safeArgs = sanitiseToolArgs(parsed.lastToolArgs);
    const safeRecords = records.filter((record): record is ConversationRecordReference => Boolean(record)).slice(0, 20);
    return {
      version: 2,
      branchId,
      lastToolId: parsed.lastToolId,
      lastToolArgs: safeArgs,
      records: safeRecords,
      focus: deriveFocus(safeRecords, safeArgs),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function buildAiConversationContext(input: Omit<AiConversationContext, "version" | "focus" | "records"> & {
  records: Array<Pick<ConversationRecordReference, "id" | "title" | "href">>;
}): AiConversationContext {
  const safeRecords = input.records.map(safeRecordReference).filter((record): record is ConversationRecordReference => Boolean(record)).slice(0, 20);
  const safeArgs = sanitiseToolArgs(input.lastToolArgs);
  return {
    version: 2,
    branchId: input.branchId,
    lastToolId: input.lastToolId,
    lastToolArgs: safeArgs,
    records: safeRecords,
    focus: deriveFocus(safeRecords, safeArgs),
    updatedAt: input.updatedAt,
  };
}

function withPriorStageArgs(context: AiConversationContext, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(typeof context.focus.stage === "string" ? { stage: context.focus.stage } : {}),
    ...(context.focus.timeframe ?? {}),
    ...extra,
  };
}

export function resolveConversationFollowUp(question: string, context: AiConversationContext | null, validStages: Set<string>): ContextFollowUp | null {
  if (!context) return null;
  const normalized = question.trim().toLowerCase();
  const stage = context.focus.stage;
  const refersToRecentJobs = /\b(those|them|these|the jobs|the containers|container numbers?)\b/.test(normalized);
  const focusedContainerId = context.focus.containerId;

  if (/\b(show|list|display)\s+(?:the\s+)?overdue\s+(?:ones|jobs|containers)\b/.test(normalized)) {
    if (["overdue_containers", "delayed_jobs", "stage_delays"].includes(context.lastToolId)) {
      return { toolId: context.lastToolId, args: context.lastToolArgs, label: "recent overdue results (follow-up)" };
    }
    return { toolId: "overdue_containers", args: {}, label: "overdue containers (follow-up)" };
  }

  if (/\b(which|what)\s+branch.*\b(highest|most|largest)\s+(?:amount|value|performance)\b|\b(highest|most|largest)\s+(?:amount|value|performance).*\bbranch\b/.test(normalized)) {
    return { toolId: "branch_performance", args: context.focus.timeframe ?? {}, label: "branch performance (follow-up)" };
  }

  if (focusedContainerId && /\b(why|investigate|explain|reason)\b/.test(normalized) && /\b(it|this|that|container|job)\b/.test(normalized)) {
    return { toolId: "container_delay_investigation", args: { containerId: focusedContainerId }, label: "recent container investigation (follow-up)" };
  }
  if (focusedContainerId && /\b(open|show|inspect)\s+(?:the\s+)?(?:first\s+)?container\b/.test(normalized)) {
    return { toolId: "container_lookup", args: { containerId: focusedContainerId }, label: "recent container (follow-up)" };
  }
  if (focusedContainerId && /\b(documents?|docs?|files?|attachments?)\b/.test(normalized) && /\b(it|its|that|this|container|job)\b/.test(normalized)) {
    return { toolId: "container_documents", args: { containerId: focusedContainerId }, label: "recent container documents (follow-up)" };
  }
  if (focusedContainerId && /(payment history|payments|disbursements)/.test(normalized) && /\b(it|its|that|this|first|container|job)\b/.test(normalized)) {
    return { toolId: "container_payment_history", args: { containerId: focusedContainerId }, label: "recent container payment history (follow-up)" };
  }
  if (context.focus.invoiceId && /\b(invoice|balance|collection|payment status)\b/.test(normalized) && /\b(it|its|that|this|recent|last)\b/.test(normalized)) {
    return { toolId: "invoice_status", args: { invoiceId: context.focus.invoiceId }, label: "recent invoice status (follow-up)" };
  }
  if (context.focus.clientId && /\b(client|balance|receivable|credit)\b/.test(normalized) && /\b(it|its|that|this|recent|last)\b/.test(normalized)) {
    return { toolId: "client_balance", args: { clientId: context.focus.clientId }, label: "recent client balance (follow-up)" };
  }

  if (typeof stage === "string" && validStages.has(stage) && refersToRecentJobs && /(show|list|display|open|which)/.test(normalized)) {
    return { toolId: "stage_jobs", args: withPriorStageArgs(context, { status: "active", limit: 20 }), label: `${stage} active jobs (follow-up)` };
  }
  if (typeof stage === "string" && validStages.has(stage) && /\b(how many|count)\b/.test(normalized)) {
    return { toolId: "stage_count", args: withPriorStageArgs(context, { status: "all" }), label: `${stage} job count (follow-up)` };
  }
  return null;
}
