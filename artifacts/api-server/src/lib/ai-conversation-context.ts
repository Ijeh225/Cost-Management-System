export type ConversationRecordReference = {
  id: number | null;
  title: string;
  href: string;
};

export type AiConversationContext = {
  version: 1;
  branchId: number | null;
  lastToolId: string;
  lastToolArgs: Record<string, unknown>;
  records: ConversationRecordReference[];
  updatedAt: string;
};

export type ContextFollowUp = {
  toolId: string;
  args: Record<string, unknown>;
  label: string;
};

function safeRecordReference(value: unknown): ConversationRecordReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ConversationRecordReference>;
  if (typeof record.title !== "string" || typeof record.href !== "string") return null;
  const title = record.title.trim().replace(/\s+/g, " ").slice(0, 160);
  const href = record.href.trim();
  // Context may only retain an internal container link. This avoids turning an
  // AI follow-up into an arbitrary URL or cross-module record reference.
  if (!title || !/^\/containers\/\d+(?:[?#].*)?$/.test(href)) return null;
  const idMatch = href.match(/^\/containers\/(\d+)/);
  const id = Number(idMatch?.[1]);
  return Number.isInteger(id) && id > 0 ? { id, title, href: `/containers/${id}` } : null;
}

export function parseAiConversationContext(value: string | null, branchId: number | null, allowedToolIds: Set<string>): AiConversationContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AiConversationContext>;
    if (
      parsed.version !== 1 ||
      parsed.branchId !== branchId ||
      typeof parsed.lastToolId !== "string" || !allowedToolIds.has(parsed.lastToolId) ||
      !parsed.lastToolArgs || typeof parsed.lastToolArgs !== "object" || Array.isArray(parsed.lastToolArgs) ||
      !Array.isArray(parsed.records) ||
      typeof parsed.updatedAt !== "string"
    ) return null;
    const records = parsed.records.map(safeRecordReference);
    if (records.some((record) => !record)) return null;
    return {
      version: 1,
      branchId,
      lastToolId: parsed.lastToolId,
      lastToolArgs: parsed.lastToolArgs,
      records: records.filter((record): record is ConversationRecordReference => Boolean(record)).slice(0, 20),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function buildAiConversationContext(input: Omit<AiConversationContext, "version">): AiConversationContext {
  return {
    version: 1,
    branchId: input.branchId,
    lastToolId: input.lastToolId,
    lastToolArgs: input.lastToolArgs,
    records: input.records.map(safeRecordReference).filter((record): record is ConversationRecordReference => Boolean(record)).slice(0, 20),
    updatedAt: input.updatedAt,
  };
}

export function resolveConversationFollowUp(question: string, context: AiConversationContext | null, validStages: Set<string>): ContextFollowUp | null {
  if (!context) return null;
  const normalized = question.trim().toLowerCase();
  const stage = context.lastToolArgs.stage;
  const refersToRecentJobs = /\b(those|them|these|the jobs|the containers|container numbers?)\b/.test(normalized);

  if (/\b(show|list|display)\s+(?:the\s+)?overdue\s+(?:ones|jobs|containers)\b/.test(normalized)) {
    if (["overdue_containers", "delayed_jobs", "stage_delays"].includes(context.lastToolId)) {
      return { toolId: context.lastToolId, args: context.lastToolArgs, label: "recent overdue results (follow-up)" };
    }
    return { toolId: "overdue_containers", args: {}, label: "overdue containers (follow-up)" };
  }

  if (/\b(which|what)\s+branch.*\b(highest|most|largest)\s+(?:amount|value|performance)\b|\b(highest|most|largest)\s+(?:amount|value|performance).*\bbranch\b/.test(normalized)) {
    return { toolId: "branch_performance", args: {}, label: "branch performance (follow-up)" };
  }

  const firstContainer = context.records.find((record) => record.id != null);
  if (firstContainer && /\b(open|show|inspect)\s+(?:the\s+)?first\s+container\b/.test(normalized)) {
    return { toolId: "container_lookup", args: { containerId: firstContainer.id }, label: "first cited container (follow-up)" };
  }
  if (firstContainer && /(payment history|payments|disbursements)/.test(normalized) && /\b(it|its|that|this|first|container)\b/.test(normalized)) {
    return { toolId: "container_payment_history", args: { containerId: firstContainer.id }, label: "recent container payment history (follow-up)" };
  }

  if (typeof stage === "string" && validStages.has(stage) && refersToRecentJobs && /(show|list|display|open|which)/.test(normalized)) {
    return { toolId: "stage_jobs", args: { stage, status: "active", limit: 20 }, label: `${stage} active jobs (follow-up)` };
  }
  if (typeof stage === "string" && validStages.has(stage) && /\b(how many|count)\b/.test(normalized)) {
    return { toolId: "stage_count", args: { stage, status: "all" }, label: `${stage} job count (follow-up)` };
  }
  return null;
}
