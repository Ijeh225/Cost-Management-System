export function findContainerVisit<T extends { id: number; containerNumber: string }>(rows: T[], id: number, number: string): T | undefined {
  if (Number.isSafeInteger(id) && id > 0) return rows.find(row => row.id === id);
  const matches = rows.filter(row => row.containerNumber.trim().toUpperCase() === number.trim().toUpperCase());
  if (matches.length > 1) throw new Error("This container has multiple shipment visits. Select the exact container visit ID from Containers before continuing.");
  return matches[0];
}
