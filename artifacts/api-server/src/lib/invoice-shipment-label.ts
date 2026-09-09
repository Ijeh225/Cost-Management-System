export function invoiceShipmentBl(items: { containerId?: number | null; blNumber?: string | null }[] | undefined, fallback: string | null): string | null {
  const visits = items?.filter(item => item.containerId != null) ?? [];
  if (!visits.length) return fallback;
  const labels = visits.map(item => item.blNumber?.trim() ?? "");
  if (labels.some(label => !label)) return null;
  return new Set(labels.map(label => label.toUpperCase())).size === 1 ? labels[0] : null;
}
