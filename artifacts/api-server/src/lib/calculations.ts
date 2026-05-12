type NumericRecord = Record<string, string | number | Date | null | undefined>;

function toNum(val: string | number | Date | null | undefined): number {
  if (val === null || val === undefined || val instanceof Date) return 0;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fxComponent(s: NumericRecord): number {
  const usd = toNum(s.usdAmount);
  const rate = toNum(s.exchangeRate);
  return usd > 0 && rate > 0 ? usd * rate : 0;
}

export function sumShipping(s: NumericRecord): number {
  const base = toNum(s.shippingCompany) + toNum(s.shippingPaymentVat) + toNum(s.consignee) +
    toNum(s.finalInvoiceShippingCompany) + toNum(s.telexCharge) + toNum(s.shippingRunnings) +
    toNum(s.shippingDetentionToBePaidByCustomer);
  return base + fxComponent(s);
}

export function sumCustoms(c: NumericRecord): number {
  const base = toNum(c.duty) + toNum(c.valuation) + toNum(c.ciu) +
    toNum(c.upCountryCustom) + toNum(c.dciu) + toNum(c.mdReleasingPackage) +
    toNum(c.ocSettlement) + toNum(c.ocReleaseLocal) + toNum(c.dcEnforcementForTransire) +
    toNum(c.complianceTeam) + toNum(c.cacSettlement) + toNum(c.crffn) + toNum(c.soncap) +
    toNum(c.alerts) + toNum(c.examinationBonus);
  return base + fxComponent(c);
}

export function sumTerminal(t: NumericRecord): number {
  const base = toNum(t.terminalCharges) + toNum(t.terminalAdditions1) + toNum(t.ikorouduTerminalAdditions2) +
    toNum(t.terminalDemurrageToBePaidByCustomer) + toNum(t.terminalPaymentVat) +
    toNum(t.wharfageFeeForNpa) + toNum(t.sifaxGmtSigning) + toNum(t.tsDcAdmin) +
    toNum(t.tincanBond) + toNum(t.bond) + toNum(t.manifest);
  return base + fxComponent(t);
}

export function sumDelivery(d: NumericRecord): number {
  const base = toNum(d.passingOfTruck) + toNum(d.passingOfTruckForEmptyReturn) + toNum(d.parkingForPullout) +
    toNum(d.pullout) + toNum(d.delivery) + toNum(d.emptyReturn) + toNum(d.unchainingTruck) +
    toNum(d.emptyCallUp) + toNum(d.pulloutExpenses) + toNum(d.transferToIkorodu) + toNum(d.transportAllowance);
  return base + fxComponent(d);
}

export function sumOperations(o: NumericRecord): number {
  const base = toNum(o.fouBooking) + toNum(o.fou) + toNum(o.scanningToPhysical) + toNum(o.security) +
    toNum(o.additionalDeliveryExpenses) + toNum(o.miscellaneous) + toNum(o.abandoned) +
    toNum(o.agenciesBlocks) + toNum(o.callUp) + toNum(o.transireRunnings) +
    toNum(o.officePtml) + toNum(o.freshPayment);
  return base + fxComponent(o);
}

export function calcTotalCost(
  shipping: NumericRecord,
  customs: NumericRecord,
  terminal: NumericRecord,
  delivery: NumericRecord,
  operations: NumericRecord
): number {
  return sumShipping(shipping) + sumCustoms(customs) + sumTerminal(terminal) +
    sumDelivery(delivery) + sumOperations(operations);
}
