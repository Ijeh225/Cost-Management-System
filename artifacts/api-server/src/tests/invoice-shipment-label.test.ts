import { describe, expect, it } from "vitest";
import { invoiceShipmentBl } from "../lib/invoice-shipment-label.js";
describe("multi-container invoice B/L label", () => {
  it("shows a shared B/L once, without treating a general fee as another shipment", () => {
    expect(invoiceShipmentBl([{ containerId: 1, blNumber: "BL-A" }, { containerId: 2, blNumber: " bl-a " }, { containerId: null }], null)).toBe("BL-A");
  });
  it("does not claim one B/L for multiple different shipments or missing references", () => {
    expect(invoiceShipmentBl([{ containerId: 1, blNumber: "BL-A" }, { containerId: 2, blNumber: "BL-B" }], "BL-A")).toBeNull();
    expect(invoiceShipmentBl([{ containerId: 1 }], "BL-A")).toBeNull();
  });
  it("keeps legacy single-container invoices without item references readable", () => {
    expect(invoiceShipmentBl(undefined, "OLD-BL")).toBe("OLD-BL");
  });
});
