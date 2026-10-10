import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { is, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db/schema";
import { accountingDate, journalHash, minorToMoney, moneyToMinor, normalizeJournal, validatePolicy } from "../lib/accounting-rules";

const input = { bookId: 1, branchId: 1, currency: "NGN", accountingDate: "2026-10-10", eventKey: "qa:request:1",
  narration: "Controlled adjustment", evidence: "Reviewed dummy evidence", lines: [
    { accountId: 1, debit: "0.30", credit: "0" }, { accountId: 2, debit: "0", credit: "0.30" },
  ] };
describe("accounting foundation exact validation", () => {
  it("uses exact minor units beyond Number safe precision", () => {
    expect(moneyToMinor("9999999999999999.99")).toBe(999999999999999999n);
    expect(minorToMoney(999999999999999999n)).toBe("9999999999999999.99");
    expect(moneyToMinor("0.1") + moneyToMinor("0.20")).toBe(moneyToMinor("0.30"));
    expect(minorToMoney(-30n)).toBe("-0.30");
  });
  it.each([0.3, "0.001", "1e3", "-1", "", "NaN", "Infinity", "01", "10000000000000000", "1,000", " 1"])("rejects unsafe amount %s", value => {
    expect(() => moneyToMinor(value)).toThrow();
  });
  it.each(["2026-02-30", "2026-13-01", "0000-01-01", "10/10/2026", "not-a-date"])("rejects invalid date %s", value => {
    expect(() => accountingDate(value)).toThrow("YYYY-MM-DD");
  });
  it("accepts a valid historical calendar date without inventing the company cutover", () => {
    expect(() => accountingDate("1999-01-01")).not.toThrow();
    expect(() => accountingDate("2024-02-29")).not.toThrow();
  });
  it("normalizes decimal notation for deterministic retries", () => {
    const a = normalizeJournal(input);
    const b = normalizeJournal({ ...input, lines: input.lines.map(l => ({ ...l, debit: l.debit === "0.30" ? "0.3" : "0.00" })) });
    expect(journalHash(a)).toBe(journalHash(b));
    expect(journalHash(a)).not.toBe(journalHash(normalizeJournal({ ...input, evidence: "Changed evidence" })));
  });
  it("rejects zero, both-sided, one-line and unbalanced journals", () => {
    for (const lines of [[input.lines[0]!], [{ accountId: 1, debit: "0", credit: "0" }, input.lines[1]!],
      [{ accountId: 1, debit: "0.3", credit: "0.3" }, input.lines[1]!],
      [{ accountId: 1, debit: "0.31", credit: "0" }, input.lines[1]!]]) expect(() => normalizeJournal({ ...input, lines })).toThrow();
  });
  it("does not accept partial or empty approved accounting rules", () => {
    expect(() => validatePolicy({})).toThrow("legalEntity");
    expect(() => validatePolicy(null)).toThrow();
  });
  it("keeps foundation models out of generic schema push and protects already-created accounting tables", () => {
    const tables = Object.values(schema).filter(value => is(value, PgTable)).map(table => getTableName(table));
    expect(tables.length).toBeGreaterThan(50);
    expect(tables.filter(name => name.startsWith("accounting_"))).toHaveLength(0);
    const config = readFileSync(new URL("../../../../lib/db/drizzle.config.ts", import.meta.url), "utf8");
    expect(config).toContain('tablesFilter: ["!accounting_*"]');
  });
});
