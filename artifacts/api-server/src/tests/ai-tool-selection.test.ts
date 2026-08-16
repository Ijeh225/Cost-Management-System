import { describe, expect, it } from "vitest";
import { parseEvidenceBasedAnswer, parseNaturalLanguageSelection, sanitizeToolArguments } from "../lib/ai-tool-selection.js";
import { AI_BUSINESS_DEFINITIONS, getAiBusinessDefinitionsPrompt, getRelevantAiBusinessDefinitionsPrompt, isPhysicalTerminalPresenceQuestion, resolveAiOperationalStage } from "../lib/ai-business-definitions.js";

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

describe("AI evidence answer validation", () => {
  const evidence = {
    facts: [{ label: "Open containers", value: 2 }, { label: "In terminal workflow", value: 1 }],
    records: [{ href: "/containers/12" }],
  };

  it("accepts an answer only when its fact and record references are exact evidence", () => {
    expect(parseEvidenceBasedAnswer({
      directAnswer: "There are 2 open containers in the current result.",
      factLabels: ["Open containers"],
      recordHrefs: ["/containers/12"],
    }, evidence)).toEqual({
      directAnswer: "There are 2 open containers in the current result.",
      factLabels: ["Open containers"],
      recordHrefs: ["/containers/12"],
    });
  });

  it("rejects invented citations and figures before they reach the user", () => {
    expect(parseEvidenceBasedAnswer({ directAnswer: "There are 99 containers.", factLabels: ["Invented fact"], recordHrefs: ["/containers/12"] }, evidence)).toBeNull();
    expect(parseEvidenceBasedAnswer({ directAnswer: "There are 99 containers.", factLabels: ["Open containers"], recordHrefs: ["/containers/12"] }, evidence)).toBeNull();
  });
});

describe("AI operational business definitions", () => {
  it("distinguishes physical terminal presence from the Terminal/TDO department queue", () => {
    expect(isPhysicalTerminalPresenceQuestion("How many jobs are in the terminal?")).toBe(true);
    expect(isPhysicalTerminalPresenceQuestion("Show containers at the terminal")).toBe(true);
    expect(isPhysicalTerminalPresenceQuestion("How many Terminal / TDO active jobs are there?")).toBe(false);
    expect(isPhysicalTerminalPresenceQuestion("Show jobs awaiting TDO release")).toBe(false);
  });

  it("uses approved logistics aliases and exposes their canonical definitions", () => {
    expect(resolveAiOperationalStage("Show active Transire jobs")).toBe("transire_processing");
    expect(resolveAiOperationalStage("List Delivery Order releases")).toBe("shipping");
    expect(resolveAiOperationalStage("Which TDO jobs are active?")).toBe("terminal");
    expect(resolveAiOperationalStage("Show pull out jobs")).toBe("pull_out");
    expect(getAiBusinessDefinitionsPrompt()).toContain("Outstanding: The unpaid balance");
    expect(getAiBusinessDefinitionsPrompt()).toContain("physically present in the terminal");
  });

  it("keeps a maintained glossary for every major application domain while selecting relevant terms per question", () => {
    expect(new Set(AI_BUSINESS_DEFINITIONS.map((definition) => definition.category))).toEqual(new Set([
      "access", "operations", "workflow", "finance", "documents", "reporting", "notifications", "ai",
    ]));
    const financePrompt = getRelevantAiBusinessDefinitionsPrompt("Show outstanding overhead expenses and approved payment schedules.");
    expect(financePrompt).toContain("Outstanding: The unpaid balance");
    expect(financePrompt).toContain("Overhead expense");
    expect(financePrompt).toContain("Payment schedule");
    expect(financePrompt).not.toContain("Transire release");
  });
});
