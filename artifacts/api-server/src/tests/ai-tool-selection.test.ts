import { describe, expect, it } from "vitest";
import { parseNaturalLanguageSelection, sanitizeToolArguments } from "../lib/ai-tool-selection.js";

describe("AI natural-language tool selection", () => {
  const allowedTools = new Set(["stage_count", "stage_jobs", "container_lookup"]);

  it("accepts only an approved selected tool and safe arguments", () => {
    expect(parseNaturalLanguageSelection({
      kind: "tool",
      toolId: "stage_jobs",
      args: { stage: "shipping", status: "active", limit: 999, arbitrarySql: "DROP TABLE containers" },
      message: "",
    }, allowedTools)).toEqual({
      kind: "tool",
      toolId: "stage_jobs",
      args: { stage: "shipping", status: "active", limit: 50 },
      label: "stage jobs",
    });
  });

  it("rejects an invented tool instead of allowing it to execute", () => {
    expect(parseNaturalLanguageSelection({ kind: "tool", toolId: "run_sql", args: {}, message: "" }, allowedTools)).toEqual({
      kind: "unsupported",
      label: "unsupported question",
      message: "I cannot safely match that request to an approved read-only data tool yet.",
    });
  });

  it("keeps clarification requests concise and does not preserve unapproved arguments", () => {
    expect(parseNaturalLanguageSelection({ kind: "clarify", message: "Which branch and time period should I compare?", args: { branchId: 999 } }, allowedTools)).toEqual({
      kind: "clarify",
      label: "clarification needed",
      message: "Which branch and time period should I compare?",
    });
    expect(sanitizeToolArguments({ stage: "made_up_stage", limit: -1, rawSql: "select * from users" })).toEqual({});
  });
});
