import { accountingDate, moneyToMinor, minorToMoney, normalizeJournal, requireAccounting, type JournalInput } from "./accounting-rules.js";
import { calculateVat, invoiceTaxSchema, type InvoiceTaxMapping } from "./accounting-tax.js";

export interface InvoiceAccountingSource {
  kind: "invoice"; id: number; branchId: number; clientId: number; createdDate: string;
  dueDate?: string|null;
  subtotal: string; vatAmount: string; total: string;
  items: { id: number; containerId: number | null; amount: string }[];
}
export interface InvoiceAccountingMapping {
  currency: "NGN"; policyVersion: string; evidence: string;
  recognitionDate: string; recognitionEvidence: string;
  receivableAccountId: number; vatAccountId?: number; vatEvidence?: string;
  items: { itemId: number; splits: { accountId: number; amount: string; treatment: "income" | "liability"; evidence: string }[] }[];
  tax?: InvoiceTaxMapping;
}
export function invoiceEventKey(id: number) {
  requireAccounting(Number.isSafeInteger(id) && id > 0, "INVALID_SOURCE", "Positive invoice source ID required");
  return `source:invoice:${id}:v1`;
}

// No recognition, tax rate or principal/agent treatment is inferred from labels.
export function buildInvoiceJournal(bookId: number, source: InvoiceAccountingSource, mapping: InvoiceAccountingMapping) {
  const eventKey = invoiceEventKey(source.id);
  requireAccounting(source.kind === "invoice" && Number.isSafeInteger(source.clientId) && source.clientId > 0,
    "INVALID_SOURCE", "Linked invoice customer required");
  accountingDate(source.createdDate); accountingDate(mapping.recognitionDate);
  if(source.dueDate!==undefined && source.dueDate!==null) accountingDate(source.dueDate);
  requireAccounting(mapping.recognitionDate >= source.createdDate, "SOURCE_REVIEW_REQUIRED", "Recognition cannot precede source creation");
  requireAccounting(mapping.currency === "NGN", "MAPPING_REQUIRED", "Explicit supported base currency required");
  for (const evidence of [mapping.policyVersion, mapping.evidence, mapping.recognitionEvidence])
    requireAccounting(typeof evidence === "string" && evidence.trim().length > 0, "MAPPING_REQUIRED", "Reviewed mapping, policy and recognition evidence required");
  const subtotal = moneyToMinor(source.subtotal), vat = moneyToMinor(source.vatAmount), total = moneyToMinor(source.total);
  requireAccounting(subtotal > 0n && total === subtotal + vat, "SOURCE_REVIEW_REQUIRED", "Positive reconciled invoice totals required");
  requireAccounting(Array.isArray(source.items) && source.items.length > 0 && source.items.length <= 150
    && new Set(source.items.map(i => i.id)).size === source.items.length
    && source.items.every(i => Number.isSafeInteger(i.id) && i.id > 0
      && (i.containerId === null || Number.isSafeInteger(i.containerId) && i.containerId > 0))
    && source.items.reduce((sum, i) => sum + moneyToMinor(i.amount), 0n) === subtotal,
  "SOURCE_REVIEW_REQUIRED", "Unique authoritative items must reconcile exactly to subtotal; no legacy item guessed");
  requireAccounting(Array.isArray(mapping.items) && mapping.items.length === source.items.length
    && new Set(mapping.items.map(i => i.itemId)).size === mapping.items.length,
  "MAPPING_REQUIRED", "Every item requires exactly one reviewed split definition");
  if(mapping.tax) {
    const tax=invoiceTaxSchema.parse({configurationId:mapping.tax.configurationId,evidence:mapping.tax.evidence,items:mapping.tax.items});
    requireAccounting(tax.items.length===source.items.length && new Set(tax.items.map(i=>i.itemId)).size===source.items.length,
      "INVALID_TAX","Every authoritative invoice item needs exactly one tax classification");
    let expected=0n;
    for(const item of source.items) {
      const selection=tax.items.find(i=>i.itemId===item.id),rule=mapping.tax.rules.find(r=>r.code===selection?.code);
      requireAccounting(rule,"INVALID_TAX","Every invoice item must use its approved tax code");
      expected+=moneyToMinor(calculateVat(item.amount,"exclusive",rule).vat);
    }
    requireAccounting(expected===vat,"TAX_SOURCE_MISMATCH","Item VAT must match recorded invoice VAT exactly; correct source totals explicitly, never silently");
  }
  const requiredCategories = new Map<number, "asset" | "income" | "liability">([[mapping.receivableAccountId, "asset"]]);
  const credits = new Map<number, bigint>();
  const addCredit = (account: number, amount: bigint, category: "income" | "liability") => {
    requireAccounting(Number.isSafeInteger(account) && account > 0 && account !== mapping.receivableAccountId,
      "INVALID_MAPPING", "Distinct valid AR and credit accounts required");
    requireAccounting(!requiredCategories.has(account) || requiredCategories.get(account) === category,
      "INVALID_MAPPING", "An account cannot have conflicting treatments");
    requiredCategories.set(account, category);
    credits.set(account, (credits.get(account) ?? 0n) + amount);
  };
  const canonicalItems = [...source.items].sort((a, b) => a.id - b.id).map(item => {
    const definition = mapping.items.find(i => i.itemId === item.id);
    requireAccounting(definition && Array.isArray(definition.splits) && definition.splits.length <= 20,
      "MAPPING_REQUIRED", "Explicit supported item splits required");
    let sum = 0n;
    const splits = definition.splits.map(split => {
      requireAccounting(["income", "liability"].includes(split.treatment) && typeof split.evidence === "string" && split.evidence.trim().length > 0,
        "MAPPING_REQUIRED", "Each income/client-funds split requires review evidence");
      const amount = moneyToMinor(split.amount);
      requireAccounting(amount > 0n, "INVALID_MAPPING", "Split amounts must be positive");
      addCredit(split.accountId, amount, split.treatment); sum += amount;
      return { accountId: split.accountId, amount: minorToMoney(amount), treatment: split.treatment, evidence: split.evidence.trim() };
    }).sort((a, b) => a.accountId - b.accountId || a.amount.localeCompare(b.amount) || a.evidence.localeCompare(b.evidence));
    requireAccounting(sum === moneyToMinor(item.amount), "MAPPING_REQUIRED", "Reviewed splits must equal their own item amount exactly");
    return { itemId: item.id, splits };
  });
  if (vat > 0n) {
    requireAccounting(typeof mapping.vatEvidence === "string" && mapping.vatEvidence.trim().length > 0
      && !credits.has(mapping.vatAccountId!), "MAPPING_REQUIRED", "Separate recorded-VAT control and reviewed tax evidence required");
    addCredit(mapping.vatAccountId!, vat, "liability");
  } else requireAccounting(mapping.vatAccountId == null && mapping.vatEvidence == null,
    "MAPPING_REQUIRED", "Zero-VAT invoice must not invent a tax posting");
  const canonicalSource = { kind: source.kind, id: source.id, branchId: source.branchId, clientId: source.clientId,
    ...(source.dueDate!==undefined ? {dueDate:source.dueDate} : {}),
    createdDate: source.createdDate, subtotal: minorToMoney(subtotal), vatAmount: minorToMoney(vat), total: minorToMoney(total),
    items: [...source.items].sort((a, b) => a.id - b.id).map(i => ({ id: i.id, containerId: i.containerId, amount: minorToMoney(moneyToMinor(i.amount)) })) };
  const canonicalMapping = { currency: mapping.currency, policyVersion: mapping.policyVersion, evidence: mapping.evidence.trim(),
    recognitionDate: mapping.recognitionDate, recognitionEvidence: mapping.recognitionEvidence.trim(), receivableAccountId: mapping.receivableAccountId,
    ...(vat > 0n ? { vatAccountId: mapping.vatAccountId, vatEvidence: mapping.vatEvidence!.trim() } : {}), items: canonicalItems,
    ...(mapping.tax ? {tax:{...mapping.tax,items:[...mapping.tax.items].sort((a,b)=>a.itemId-b.itemId),rules:[...mapping.tax.rules].sort((a,b)=>a.code.localeCompare(b.code))}} : {}) };
  const input: JournalInput = { bookId, branchId: source.branchId, currency: mapping.currency, accountingDate: mapping.recognitionDate,
    eventKey, narration: `Issued invoice #${source.id} - reviewed recognition`, evidence: JSON.stringify({ source: canonicalSource, mapping: canonicalMapping }),
    lines: [{ accountId: mapping.receivableAccountId, debit: minorToMoney(total), credit: "0" },
      ...[...credits].sort(([a], [b]) => a - b).map(([accountId, amount]) => ({ accountId, debit: "0", credit: minorToMoney(amount) }))] };
  normalizeJournal(input);
  return { input, requiredCategories, cashMovement: "0.00" as const };
}
