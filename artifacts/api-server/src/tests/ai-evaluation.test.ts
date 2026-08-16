import { describe, expect, it } from "vitest";
import { extractProviderUsage, parseEvidenceBasedAnswer, parseNaturalLanguageSelection, sanitizeToolArguments } from "../lib/ai-tool-selection.js";
import { canUseAiAssistantRollout } from "../lib/ai-rollout-policy.js";

/**
 * Phase 8 protected, anonymised evaluation cases. These never query a live
 * database or send a prompt to a provider; they lock down the safety boundary.
 */
describe("AI Assistant safety evaluation set", () => {
  const approved = new Set(["operations_overview", "stage_jobs", "container_lookup"]);

  it("does not turn prompt-injection text into a data tool or unsafe argument", () => {
    expect(parseNaturalLanguageSelection({
      kind: "tool",
      toolId: "delete_everything",
      args: { rawSql: "DROP TABLE containers", ignoreInstructions: true },
      message: "",
    }, approved).kind).toBe("unsupported");
    expect(sanitizeToolArguments({ limit: 5, branchId: 999, rawSql: "SELECT * FROM users" })).toEqual({ limit: 5 });
  });

  it("keeps ambiguous stage wording in clarification rather than inventing a stage", () => {
    expect(parseNaturalLanguageSelection({
      kind: "clarify",
      toolId: null,
      args: { stage: "unknown_stage" },
      message: "Which operational stage should I review?",
    }, approved)).toMatchObject({ kind: "clarify", label: "clarification needed" });
  });

  it("rejects financial claims that are not grounded in supplied facts", () => {
    expect(parseEvidenceBasedAnswer({
      directAnswer: "The outstanding balance is 500000.",
      factLabels: ["Outstanding balance"],
      recordHrefs: [],
    }, { facts: [{ label: "Outstanding balance" }], records: [] })).toBeNull();
  });

  it("records only numeric provider token usage for budget monitoring", () => {
    expect(extractProviderUsage({ model: "test-model", usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 } })).toEqual({ model: "test-model", inputTokens: 120, outputTokens: 45, totalTokens: 165 });
    expect(extractProviderUsage({ usage: { input_tokens: "not-a-number" } })).toBeNull();
  });

  it("enforces staged rollout roles without granting staff access", () => {
    expect(canUseAiAssistantRollout({ userId: 1, role: "super_admin", rolloutStage: "super_admin_only", selectedAdminUserIds: [] })).toBe(true);
    expect(canUseAiAssistantRollout({ userId: 2, role: "admin", rolloutStage: "selected_admins", selectedAdminUserIds: [2] })).toBe(true);
    expect(canUseAiAssistantRollout({ userId: 3, role: "admin", rolloutStage: "selected_admins", selectedAdminUserIds: [2] })).toBe(false);
    expect(canUseAiAssistantRollout({ userId: 2, role: "staff", rolloutStage: "all_authorized_admins", selectedAdminUserIds: [] })).toBe(false);
  });
});
