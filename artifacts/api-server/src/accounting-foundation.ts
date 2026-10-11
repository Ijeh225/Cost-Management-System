// Internal foundation entry point, not a public HTTP API or an automatic poster.
// Future approved source adapters reuse this engine; loading it performs no writes.
export { NativeAccounting } from "./lib/native-accounting";
export { ensureAccountingFoundationSchema } from "./lib/accounting-schema";
export { buildSettlementJournal, previewOpeningBalances, settlementEventKey } from "./lib/accounting-source-mapping";
export { ACCOUNTING_PERMISSIONS, ACCOUNTING_POLICY_KEYS, DRAFT_CHART, DRAFT_CHART_VERSION,
  AccountingError, accountingEnabled, moneyToMinor, minorToMoney } from "./lib/accounting-rules";
