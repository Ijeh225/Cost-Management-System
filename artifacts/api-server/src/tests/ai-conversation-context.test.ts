import { describe, expect, it } from "vitest";
import { buildAiConversationContext, parseAiConversationContext, resolveConversationFollowUp } from "../lib/ai-conversation-context.js";

const tools = new Set(["stage_jobs", "stage_count", "overdue_containers", "branch_performance", "container_lookup", "container_payment_history", "container_documents", "container_delay_investigation", "invoice_status", "client_balance"]);
const stages = new Set(["shipping", "terminal"]);

describe("AI conversation context", () => {
  const context = buildAiConversationContext({
    branchId: 7,
    lastToolId: "stage_jobs",
    lastToolArgs: { stage: "shipping", status: "active" },
    records: [{ id: 42, title: "MSCU1234567", href: "/containers/42" }],
    updatedAt: "2026-08-16T12:00:00.000Z",
  });

  it("keeps only safe internal container references and rejects another branch context", () => {
    expect(context.records).toEqual([{ id: 42, title: "MSCU1234567", href: "/containers/42", kind: "container" }]);
    expect(parseAiConversationContext(JSON.stringify(context), 8, tools)).toBeNull();
    expect(parseAiConversationContext(JSON.stringify({ ...context, records: [{ id: 42, title: "Bad", href: "https://example.com" }] }), 7, tools)).toBeNull();
  });

  it("uses the prior stage safely for a plural follow-up", () => {
    expect(resolveConversationFollowUp("show those container numbers", context, stages)).toEqual({
      toolId: "stage_jobs", args: { stage: "shipping", status: "active", limit: 20 }, label: "shipping active jobs (follow-up)",
    });
  });

  it("opens or reviews payments for a cited container through an approved lookup tool", () => {
    expect(resolveConversationFollowUp("open first container", context, stages)).toEqual({
      toolId: "container_lookup", args: { containerId: 42 }, label: "recent container (follow-up)",
    });
    expect(resolveConversationFollowUp("show its payment history", context, stages)).toEqual({
      toolId: "container_payment_history", args: { containerId: 42 }, label: "recent container payment history (follow-up)",
    });
  });

  it("can refresh overdue results and branch comparisons without relying on stale values", () => {
    const overdue = { ...context, lastToolId: "overdue_containers", lastToolArgs: {} };
    expect(resolveConversationFollowUp("show overdue ones", overdue, stages)).toEqual({ toolId: "overdue_containers", args: {}, label: "recent overdue results (follow-up)" });
    expect(resolveConversationFollowUp("which branch has the highest amount?", context, stages)).toEqual({ toolId: "branch_performance", args: {}, label: "branch performance (follow-up)" });
  });

  it("retains a safe invoice, client, timeframe, and stage focus for follow-up questions", () => {
    const invoiceContext = buildAiConversationContext({
      branchId: 7,
      lastToolId: "invoice_status",
      lastToolArgs: { invoiceId: 88, stage: "shipping", from: "2026-08-01", to: "2026-08-31", unsafe: "discard me" },
      records: [
        { id: 88, title: "INV-2026-0088", href: "/invoices/88" },
        { id: 12, title: "Dangote", href: "/accounts-receivable?client=12" },
      ],
      updatedAt: "2026-08-16T12:00:00.000Z",
    });
    expect(invoiceContext.focus).toEqual({
      containerId: null, invoiceId: 88, clientId: 12, stage: "shipping",
      timeframe: { from: "2026-08-01", to: "2026-08-31" },
    });
    expect(invoiceContext.lastToolArgs).not.toHaveProperty("unsafe");
    expect(resolveConversationFollowUp("what is its payment status?", invoiceContext, stages)).toEqual({
      toolId: "invoice_status", args: { invoiceId: 88 }, label: "recent invoice status (follow-up)",
    });
    expect(resolveConversationFollowUp("show those container numbers", invoiceContext, stages)).toEqual({
      toolId: "stage_jobs",
      args: { stage: "shipping", from: "2026-08-01", to: "2026-08-31", status: "active", limit: 20 },
      label: "shipping active jobs (follow-up)",
    });
  });

  it("migrates a safe version one context in memory without trusting its old arguments", () => {
    const legacy = {
      version: 1, branchId: 7, lastToolId: "container_lookup", lastToolArgs: { containerId: 42, arbitrary: "no" },
      records: [{ id: 42, title: "MSCU1234567", href: "/containers/42" }], updatedAt: "2026-08-16T12:00:00.000Z",
    };
    const parsed = parseAiConversationContext(JSON.stringify(legacy), 7, tools);
    expect(parsed?.version).toBe(2);
    expect(parsed?.focus.containerId).toBe(42);
    expect(parsed?.lastToolArgs).not.toHaveProperty("arbitrary");
  });
});
