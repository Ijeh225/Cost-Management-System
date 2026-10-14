import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { hasRetainedInvoiceJournal } from "../lib/invoice-native-cancellation.js";

describe("retained native invoice cancellation protection", () => {
  it("does not query native tables before schema exists", async () => {
    const execute=vi.fn().mockResolvedValue({rows:[{relation:null}]});
    expect(await hasRetainedInvoiceJournal({execute},19)).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each([true,false])("honours retained draft/posted existence %s without a runtime flag bypass",async retained=>{
    const execute=vi.fn().mockResolvedValueOnce({rows:[{relation:'accounting_journals'}]}).mockResolvedValueOnce({rows:[{retained}]});
    expect(await hasRetainedInvoiceJournal({execute},19)).toBe(retained);
    const query=new PgDialect().sqlToQuery(execute.mock.calls[1]![0]);
    expect(query.params).toEqual(['source:invoice:19:%']);
    expect(query.sql).toContain("status IN ('draft','posted')");
  });
  it("fails closed on database errors",async()=>{
    const execute=vi.fn().mockRejectedValue(new Error('Unavailable'));
    await expect(hasRetainedInvoiceJournal({execute},19)).rejects.toThrow('Unavailable');
  });
});
