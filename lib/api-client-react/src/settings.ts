import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export const SETTINGS_QUERY_KEY = ["/api/settings"];

export const BUILT_IN_FIELD_DEFAULTS: Record<string, Record<string, string>> = {
  shipping: {
    shippingCompany: "Shipping Company",
    shippingPaymentVat: "Shipping Payment VAT",
    consignee: "Consignee",
    finalInvoiceShippingCompany: "Final Invoice (Shipping Co.)",
    telexCharge: "Telex Charge",
    shippingRunnings: "Shipping Runnings",
    shippingDetentionToBePaidByCustomer: "Shipping Detention (Customer)",
  },
  customs: {
    duty: "Duty",
    dutyPaid: "Duty Paid",
    dutyNotPaid: "Duty Not Paid",
    valuation: "Valuation",
    ciu: "CIU",
    upCountryCustom: "Up Country Custom",
    dciu: "DCIU",
    mdReleasingPackage: "MD Releasing Package",
    ocSettlement: "OC Settlement",
    ocReleaseLocal: "OC Release Local",
    dcEnforcementForTransire: "DC Enforcement (Transire)",
    complianceTeam: "Compliance Team",
    cacSettlement: "CAC Settlement",
    crffn: "CRFFN",
    soncap: "SONCAP",
    alerts: "Alerts",
    examinationBonus: "Examination Bonus",
  },
  terminal: {
    terminalCharges: "Terminal Charges (THC)",
    terminalAdditions1: "Terminal Additions 1",
    ikorouduTerminalAdditions2: "Ikorodu Terminal Additions 2",
    terminalDemurrageToBePaidByCustomer: "Terminal Demurrage (Customer)",
    terminalPaymentVat: "Terminal Payment VAT",
    wharfageFeeForNpa: "Wharfage Fee (NPA)",
    sifaxGmtSigning: "SIFAX/GMT Signing",
    tsDcAdmin: "TS DC Admin",
    tincanBond: "Tincan Bond",
    bond: "Bond",
    manifest: "Manifest",
  },
  delivery: {
    passingOfTruck: "Passing of Truck",
    passingOfTruckForEmptyReturn: "Passing of Truck (Empty Return)",
    parkingForPullout: "Parking for Pullout",
    pullout: "Pullout",
    delivery: "Delivery",
    emptyReturn: "Empty Return",
    unchainingTruck: "Unchaining Truck",
    emptyCallUp: "Empty Call-Up",
    pulloutExpenses: "Pullout Expenses",
    transferToIkorodu: "Transfer to Ikorodu",
    transportAllowance: "Transport Allowance",
  },
  operations: {
    fouBooking: "FOU Booking",
    fou: "FOU",
    scanningToPhysical: "Scanning to Physical",
    security: "Security",
    additionalDeliveryExpenses: "Additional Delivery Expenses",
    miscellaneous: "Miscellaneous",
    abandoned: "Abandoned",
    agenciesBlocks: "Agencies/Blocks",
    callUp: "Call Up",
    transireRunnings: "Transire Runnings",
    officePtml: "Office PTML",
    freshPayment: "Fresh Payment",
  },
};

export function builtInFieldLabelKey(section: string, field: string): string {
  return `label__${section}__${field}`;
}

export function builtInFieldHiddenKey(section: string, field: string): string {
  return `hide__${section}__${field}`;
}

export function getBuiltInFieldLabel(settings: Record<string, string>, section: string, field: string): string {
  return settings[builtInFieldLabelKey(section, field)] || BUILT_IN_FIELD_DEFAULTS[section]?.[field] || field.replace(/([A-Z])/g, " $1").trim();
}

export function isBuiltInFieldHidden(settings: Record<string, string>, section: string, field: string): boolean {
  return settings[builtInFieldHiddenKey(section, field)] === "1";
}

export const BUILT_IN_SECTION_DEFAULTS: Record<string, string> = {
  shipping:   "Shipping Charges",
  customs:    "Customs Duty & Taxes",
  terminal:   "Terminal Charges",
  delivery:   "Delivery & Transport",
  operations: "Operations & Misc.",
};

export const BUILT_IN_SECTIONS = [
  { key: "shipping",   defaultTitle: "Shipping Charges" },
  { key: "customs",    defaultTitle: "Customs Duty & Taxes" },
  { key: "terminal",   defaultTitle: "Terminal Charges" },
  { key: "delivery",   defaultTitle: "Delivery & Transport" },
  { key: "operations", defaultTitle: "Operations & Misc." },
];

export function useGetSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => customFetch<Record<string, string>>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, string>) =>
      customFetch<Record<string, string>>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });
}

// ─── Builtin Extra Fields ─────────────────────────────────────────────────────

export type BuiltinExtraField = {
  id: number;
  builtinSectionKey: string;
  name: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  isRequired: boolean;
  includeInTotal: boolean;
  visibleByRole: string;
  editableByRole: string;
  dropdownOptions: string;
  fieldOrder: number;
};

export type BuiltinExtraFieldValue = {
  id: number;
  containerId: number;
  fieldId: number;
  value: string;
};

export const BUILTIN_EXTRAS_QUERY_KEY = ["/api/builtin-extras"];

export function useGetBuiltinExtras() {
  return useQuery({
    queryKey: BUILTIN_EXTRAS_QUERY_KEY,
    queryFn: () => customFetch<Record<string, BuiltinExtraField[]>>("/api/builtin-extras"),
  });
}

export function useAddBuiltinExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      builtinSectionKey: string;
      name: string;
      fieldType?: string;
      placeholder?: string;
      helpText?: string;
      defaultValue?: string;
      isRequired?: boolean;
      includeInTotal?: boolean;
      visibleByRole?: string;
      editableByRole?: string;
      dropdownOptions?: string;
    }) =>
      customFetch<BuiltinExtraField>("/api/builtin-extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUILTIN_EXTRAS_QUERY_KEY }),
  });
}

export function useUpdateBuiltinExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }: {
      fieldId: number;
      data: Partial<Omit<BuiltinExtraField, "id" | "builtinSectionKey" | "fieldOrder">>;
    }) =>
      customFetch<BuiltinExtraField>(`/api/builtin-extras/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUILTIN_EXTRAS_QUERY_KEY }),
  });
}

export function useDeleteBuiltinExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: number) =>
      customFetch<{ success: boolean }>(`/api/builtin-extras/${fieldId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUILTIN_EXTRAS_QUERY_KEY }),
  });
}

export function useGetContainerBuiltinExtraValues(containerId: number) {
  return useQuery({
    queryKey: [`/api/containers/${containerId}/custom-values`],
    queryFn: () => customFetch<BuiltinExtraFieldValue[]>(`/api/containers/${containerId}/custom-values`),
    enabled: containerId > 0,
  });
}

export function useSaveContainerBuiltinExtraValues(containerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Array<{ fieldId: number; value: string }>) =>
      customFetch<{ success: boolean }>(`/api/containers/${containerId}/custom-values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}/custom-values`] });
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    },
  });
}
