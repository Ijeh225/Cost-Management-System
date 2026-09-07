import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceItemAmount, invoicePreview } from "../artifacts/cost-analysis/src/lib/invoice-preview.ts";

test("agreed rate overrides the container charge, including zero", () => {
  assert.equal(invoiceItemAmount("100", 90), 90);
  assert.equal(invoiceItemAmount("100", 100), 100);
  assert.equal(invoiceItemAmount("100", 0), 0);
});

test("unset agreed rate falls back to each container charge", () => {
  assert.equal(invoiceItemAmount("100", null), 100);
  assert.equal(invoiceItemAmount("120", undefined), 120);
  assert.equal(invoiceItemAmount(null, null), 0);
});

test("multiple containers use the agreed rate per item before VAT", () => {
  const amounts = ["100", "200"].map(charge => invoiceItemAmount(charge, 90));
  assert.deepEqual(invoicePreview(amounts, 7.5), { subtotal: 180, vatAmount: 13.5, total: 193.5 });
  assert.deepEqual(invoicePreview([100, 200], 0), { subtotal: 300, vatAmount: 0, total: 300 });
  assert.deepEqual(invoicePreview([0, 0], 7.5), { subtotal: 0, vatAmount: 0, total: 0 });
});
