export function containerVisitKey(row: { containerNumber: string; blNumber: string }): string {
  return JSON.stringify([row.containerNumber.trim().toUpperCase(), row.blNumber.trim().toUpperCase()]);
}
