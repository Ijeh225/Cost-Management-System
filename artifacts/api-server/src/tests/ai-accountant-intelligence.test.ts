import { describe, expect, it } from "vitest";
import { analyseAccountantControls } from "../lib/ai-accountant-intelligence.js";

describe("AI accountant intelligence", () => {
  it("returns review prompts for measurable finance-control exceptions", () => {
    const findings = analyseAccountantControls({
      schedules: [
        { id: 1, amountRequested: 100, amountApproved: 120, amountPaid: 0 },
        { id: 2, amountRequested: 100, amountApproved: 80, amountPaid: 90 },
      ],
      duties: [{ containerId: 9, duty: 50, dutyPaid: 60 }],
      bankTransfers: [
        { id: 3, branchId: 1, fromBankId: 1, toBankId: 2, amount: 500, reference: "TRF-1" },
        { id: 4, branchId: 1, fromBankId: 1, toBankId: 2, amount: 500, reference: "trf-1" },
        { id: 5, branchId: 1, fromBankId: 7, toBankId: 7, amount: 20, reference: null },
      ],
      overheadPayments: [
        { id: 6, branchId: 1, expenseId: 8, amount: 40, paymentMethod: "bank", bankId: 2, paidAt: new Date("2026-08-17") },
        { id: 7, branchId: 1, expenseId: 8, amount: 40, paymentMethod: "bank", bankId: 2, paidAt: new Date("2026-08-17") },
      ],
    });
    expect(findings).toEqual(expect.arrayContaining([
      { code: "schedule_overapproved", ids: [1] },
      { code: "schedule_overpaid", ids: [2] },
      { code: "duty_overpaid", ids: [9] },
      { code: "duplicate_bank_transfer", ids: [3, 4] },
      { code: "duplicate_overhead_payment", ids: [6, 7] },
      { code: "self_bank_transfer", ids: [5] },
    ]));
  });
});
