const MONEY_TOLERANCE = 0.005;

export function exceedsApprovedPaymentBalance(currentPaid: number, amount: number, approvedAmount: number): boolean {
  return currentPaid + amount > approvedAmount + MONEY_TOLERANCE;
}

export function exceedsOverheadPaymentBalance(amount: number, overheadTotal: number, overheadPaid: number): boolean {
  return amount > Math.max(0, overheadTotal - overheadPaid) + MONEY_TOLERANCE;
}

export function isScheduleReadyToComplete(amountPaid: number, approvedAmount: number): boolean {
  return amountPaid + MONEY_TOLERANCE >= approvedAmount;
}
