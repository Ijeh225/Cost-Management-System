export type ApprovedToolDescriptor = {
  id: string;
  title: string;
  description: string;
};

export type NaturalLanguageToolSelection =
  | { kind: "tool"; toolId: string; args: Record<string, unknown>; label: string }
  | { kind: "clarify"; message: string; label: string }
  | { kind: "unsupported"; message: string; label: string };

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

export function isNaturalLanguageRoutingConfigured(): boolean {
  return Boolean(process.env.AI_ASSISTANT_OPENAI_API_KEY?.trim());
}

export async function selectToolWithNaturalLanguage(input: {
  question: string;
  tools: ApprovedToolDescriptor[];
  role: string;
  branchScope: number | null;
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
        input: `User role: ${input.role}. Branch scope: ${input.branchScope == null ? "all authorised branches" : `branch ${input.branchScope}`}.\nApproved tools: ${JSON.stringify(input.tools)}\nUser question: ${input.question}`,
        text: { format: { type: "json_schema", name: "approved_tool_selection", strict: false, schema } },
      }),
    });
    if (!response.ok) throw new Error(`AI provider request failed (${response.status}).`);
    const outputText = extractResponseText(await response.json());
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
