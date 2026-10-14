type NumericRecord = Record<string, string | number | Date | null | undefined>;

// Shared budget field inventory; actual payments and duty paid/unpaid summaries are not budget lines.
export const BUDGET_CHARGE_FIELDS = {
  shipping: ["shippingCompany","shippingPaymentVat","consignee","finalInvoiceShippingCompany","telexCharge","shippingRunnings","shippingDetentionToBePaidByCustomer"],
  customs: ["duty","valuation","ciu","upCountryCustom","dciu","mdReleasingPackage","ocSettlement","ocReleaseLocal","dcEnforcementForTransire","complianceTeam","cacSettlement","crffn","soncap","alerts","examinationBonus"],
  terminal: ["terminalCharges","terminalAdditions1","ikorouduTerminalAdditions2","terminalDemurrageToBePaidByCustomer","terminalPaymentVat","wharfageFeeForNpa","sifaxGmtSigning","tsDcAdmin","tincanBond","bond","manifest"],
  delivery: ["passingOfTruck","passingOfTruckForEmptyReturn","parkingForPullout","pullout","delivery","emptyReturn","unchainingTruck","emptyCallUp","pulloutExpenses","transferToIkorodu","transportAllowance"],
  operations: ["fouBooking","fou","scanningToPhysical","security","additionalDeliveryExpenses","miscellaneous","abandoned","agenciesBlocks","callUp","transireRunnings","officePtml","freshPayment"],
} as const;
const sumFields=(row:NumericRecord,keys:readonly string[])=>keys.reduce((total,key)=>total+toNum(row[key]),0);

function toNum(val: string | number | Date | null | undefined): number {
  if (val === null || val === undefined || val instanceof Date) return 0;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export function sumShipping(s: NumericRecord): number {
  return sumFields(s,BUDGET_CHARGE_FIELDS.shipping);
}

export function sumCustoms(c: NumericRecord): number {
  return sumFields(c,BUDGET_CHARGE_FIELDS.customs);
}

export function sumTerminal(t: NumericRecord): number {
  return sumFields(t,BUDGET_CHARGE_FIELDS.terminal);
}

export function sumDelivery(d: NumericRecord): number {
  return sumFields(d,BUDGET_CHARGE_FIELDS.delivery);
}

export function sumOperations(o: NumericRecord): number {
  return sumFields(o,BUDGET_CHARGE_FIELDS.operations);
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
