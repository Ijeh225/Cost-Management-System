import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export const SETTINGS_QUERY_KEY = ["/api/settings"];

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
