export type ApprovedToolDescriptor = {
  id: string;
  title: string;
  description: string;
};

export type NaturalLanguageToolSelection =
  | { kind: "tool"; toolId: string; args: Record<string, unknown>; label: string }
  | { kind: "clarify"; message: string; label: string }
  | { kind: "unsupported"; message: string; label: string };

export type EvidenceBasedAnswer = {
  directAnswer: string;
  factLabels: string[];
  recordHrefs: string[];
};

export type AiProviderUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type ProviderSelection = {
  kind?: unknown;
  toolId?: unknown;
  args?: unknown;
  message?: unknown;
};

const VALID_STAGES = new Set(["transire_processing", "shipping", "terminal", "pull_out"]);
const VALID_STAGE_STATES = new Set(["all", "active", "released"]);

function compactText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const compacted = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compacted || undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The model response is untrusted. Keep only the small argument vocabulary that
 * the approved backend tools know how to validate and execute.
 */
export function sanitizeToolArguments(value: unknown): Record<string, unknown> {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const args: Record<string, unknown> = {};
  const stage = compactText(input.stage, 40)?.toLowerCase();
  if (stage && VALID_STAGES.has(stage)) args.stage = stage;
  const status = compactText(input.status, 20)?.toLowerCase();
  if (status && VALID_STAGE_STATES.has(status)) args.status = status;
  const limit = positiveInteger(input.limit);
  if (limit) args.limit = Math.min(limit, 50);
  const overdueDays = positiveInteger(input.overdueDays);
  if (overdueDays) args.overdueDays = Math.min(overdueDays, 365);
  for (const key of ["query", "containerNumber", "invoiceNumber", "clientName", "from", "to"] as const) {
    const text = compactText(input[key], key === "query" ? 160 : 120);
    if (text) args[key] = text;
  }
  for (const key of ["containerId", "invoiceId", "clientId"] as const) {
    const id = positiveInteger(input[key]);
    if (id) args[key] = id;
  }
  return args;
}

export function parseNaturalLanguageSelection(value: unknown, allowedToolIds: Set<string>): NaturalLanguageToolSelection {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as ProviderSelection : {};
  const kind = compactText(input.kind, 20)?.toLowerCase();
  const message = compactText(input.message, 360);
  if (kind === "tool" && typeof input.toolId === "string" && allowedToolIds.has(input.toolId)) {
    return {
      kind: "tool",
      toolId: input.toolId,
      args: sanitizeToolArguments(input.args),
      label: input.toolId.replace(/_/g, " "),
    };
  }
  if (kind === "clarify") {
    return { kind: "clarify", message: message ?? "Please specify the stage, record, period, or amount you want me to review.", label: "clarification needed" };
  }
  return { kind: "unsupported", message: message ?? "I cannot safely match that request to an approved read-only data tool yet.", label: "unsupported question" };
}

function extractResponseText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

export function extractProviderUsage(payload: unknown): AiProviderUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { model?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } };
  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);
  const totalTokens = Number(response.usage?.total_tokens ?? inputTokens + outputTokens);
  if (![inputTokens, outputTokens, totalTokens].every(Number.isFinite)) return null;
  return { model: typeof response.model === "string" ? response.model : process.env.AI_ASSISTANT_OPENAI_MODEL?.trim() || "unknown", inputTokens, outputTokens, totalTokens };
}

export function isNaturalLanguageRoutingConfigured(): boolean {
  return Boolean(process.env.AI_ASSISTANT_OPENAI_API_KEY?.trim());
}

export async function selectToolWithNaturalLanguage(input: {
  question: string;
  tools: ApprovedToolDescriptor[];
  role: string;
  branchScope: number | null;
  conversationContext?: { lastToolId: string; lastToolArgs: Record<string, unknown>; records: Array<{ title: string; href: string }> };
  onUsage?: (usage: AiProviderUsage) => void;
}): Promise<NaturalLanguageToolSelection> {
  const apiKey = process.env.AI_ASSISTANT_OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI natural-language routing is not configured.");

  const toolIds = new Set(input.tools.map((tool) => tool.id));
  const instructions = [
    "You are a routing component for a logistics and finance application.",
    "You do not answer the user's business question and you never propose an action.",
    "Choose exactly one approved read-only tool when it clearly fits, otherwise ask one concise clarification.",
    "Never invent a tool name, record ID, date, client, container, invoice, or financial value.",
    "Return JSON only with kind ('tool', 'clarify', or 'unsupported'), toolId, args, and message.",
    "Use operational stage IDs only: transire_processing, shipping, terminal, pull_out.",
  ].join(" ");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "toolId", "args", "message"],
    properties: {
      kind: { type: "string", enum: ["tool", "clarify", "unsupported"] },
      toolId: { type: ["string", "null"] },
      args: {
        type: "object",
        additionalProperties: false,
        properties: {
          stage: { type: "string" }, status: { type: "string" }, limit: { type: "integer" }, overdueDays: { type: "integer" },
          query: { type: "string" }, containerNumber: { type: "string" }, containerId: { type: "integer" },
          invoiceNumber: { type: "string" }, invoiceId: { type: "integer" }, clientName: { type: "string" }, clientId: { type: "integer" },
          from: { type: "string" }, to: { type: "string" },
        },
      },
      message: { type: "string" },
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.AI_ASSISTANT_OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        instructions,
        input: `User role: ${input.role}. Branch scope: ${input.branchScope == null ? "all authorised branches" : `branch ${input.branchScope}`}.\nApproved tools: ${JSON.stringify(input.tools)}\nRecent authorised context: ${JSON.stringify(input.conversationContext ?? null)}\nUser question: ${input.question}`,
        text: { format: { type: "json_schema", name: "approved_tool_selection", strict: false, schema } },
      }),
    });
    if (!response.ok) throw new Error(`AI provider request failed (${response.status}).`);
    const payload = await response.json();
    const usage = extractProviderUsage(payload);
    if (usage) input.onUsage?.(usage);
    const outputText = extractResponseText(payload);
    if (!outputText) throw new Error("AI provider returned no structured routing result.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("AI provider returned an invalid routing result.");
    }
    return parseNaturalLanguageSelection(parsed, toolIds);
  } finally {
    clearTimeout(timeout);
  }
}

function safeResponseText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function containsOnlyEvidenceNumbers(answer: string, evidence: unknown): boolean {
  const evidenceNumbers: string[] = JSON.stringify(evidence).match(/\d[\d,.]*/g) ?? [];
  const answerNumbers: string[] = answer.match(/\d[\d,.]*/g) ?? [];
  const knownNumbers = new Set<string>(evidenceNumbers.map((value) => value.replace(/[^\d]/g, "")));
  return answerNumbers.every((value) => knownNumbers.has(value.replace(/[^\d]/g, "")));
}

/** Validates model citations against the exact evidence supplied by the tool. */
export function parseEvidenceBasedAnswer(value: unknown, input: {
  facts: Array<{ label: string }>;
  records: Array<{ href: string }>;
}): EvidenceBasedAnswer | null {
  const parsed = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<EvidenceBasedAnswer> : {};
  const directAnswer = safeResponseText(parsed.directAnswer, 700);
  const factLabels = Array.isArray(parsed.factLabels)
    ? parsed.factLabels.map((value) => safeResponseText(value, 160)).filter(Boolean).slice(0, 12)
    : [];
  const recordHrefs = Array.isArray(parsed.recordHrefs)
    ? parsed.recordHrefs.map((value) => safeResponseText(value, 240)).filter(Boolean).slice(0, 12)
    : [];
  if (!directAnswer) return null;
  const knownFactLabels = new Set(input.facts.map((fact) => fact.label));
  const knownRecordHrefs = new Set(input.records.map((record) => record.href));
  if (factLabels.some((label) => !knownFactLabels.has(label)) || recordHrefs.some((href) => !knownRecordHrefs.has(href))) return null;
  if ((input.facts.length || input.records.length) && !factLabels.length && !recordHrefs.length) return null;
  const evidence = { facts: input.facts, records: input.records };
  return containsOnlyEvidenceNumbers(directAnswer, evidence) ? { directAnswer, factLabels, recordHrefs } : null;
}

/**
 * This receives only facts and source records already returned by a validated
 * backend tool. It cannot issue further tools or access application data.
 */
export async function generateEvidenceBasedAnswer(input: {
  question: string;
  toolTitle: string;
  scopeLabel: string;
  facts: Array<{ label: string; value: string | number; detail?: string }>;
  records: Array<{ title: string; detail: string; href: string; badges?: string[] }>;
  notes: string[];
  onUsage?: (usage: AiProviderUsage) => void;
}): Promise<EvidenceBasedAnswer | null> {
  const apiKey = process.env.AI_ASSISTANT_OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["directAnswer", "factLabels", "recordHrefs"],
    properties: {
      directAnswer: { type: "string" },
      factLabels: { type: "array", items: { type: "string" } },
      recordHrefs: { type: "array", items: { type: "string" } },
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.AI_ASSISTANT_OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        instructions: [
          "You summarise validated operational and financial tool results.",
          "Use only the supplied facts, records, and notes; do not invent figures, records, causes, dates, or recommendations.",
          "Keep the direct answer concise. Cite every factual answer using exact fact labels and/or exact record hrefs from the supplied evidence.",
          "Return JSON only.",
        ].join(" "),
        input: JSON.stringify({ question: input.question, tool: input.toolTitle, scope: input.scopeLabel, facts: input.facts.slice(0, 30), records: input.records.slice(0, 20), notes: input.notes.slice(0, 5) }),
        text: { format: { type: "json_schema", name: "evidence_based_answer", strict: false, schema } },
      }),
    });
    if (!response.ok) throw new Error(`AI provider request failed (${response.status}).`);
    const payload = await response.json();
    const usage = extractProviderUsage(payload);
    if (usage) input.onUsage?.(usage);
    const outputText = extractResponseText(payload);
    if (!outputText) throw new Error("AI provider returned no evidence summary.");
    const parsed = parseEvidenceBasedAnswer(JSON.parse(outputText), input);
    if (!parsed) throw new Error("AI provider returned an invalid or uncited evidence summary.");
    return parsed;
  } catch (error) {
    console.warn("[ai-assistant] Evidence summary unavailable; using deterministic answer", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
