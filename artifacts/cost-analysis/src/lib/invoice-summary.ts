type SummaryInvoice = {
  status: string;
  total: number;
  totalPaid: number;
  outstanding: number;
};

export function summarizeInvoices(invoices: readonly SummaryInvoice[]) {
  // Match the API's financially active invoice population; drafts are not debt.
  const issued = invoices.filter(invoice => !["draft", "cancelled", "written_off"].includes(invoice.status));
  return {
    issuedOutstanding: issued.reduce((sum, invoice) => sum + invoice.outstanding, 0),
    totalPaid: issued.reduce((sum, invoice) => sum + invoice.totalPaid, 0),
    paidCount: issued.filter(invoice => invoice.status === "paid").length,
    overdueCount: issued.filter(invoice => invoice.status === "overdue").length,
    draftValue: invoices.filter(invoice => invoice.status === "draft")
      .reduce((sum, invoice) => sum + invoice.total, 0),
  };
}
