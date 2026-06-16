import { useMemo } from "react";
import { useParams } from "wouter";
import { useGetOverheadExpenses, type OverheadExpense } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const fmtDate = (value: string | null | undefined, long = false) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
  });
};

const statusLabel: Record<OverheadExpense["status"], string> = {
  unpaid: "Unpaid",
  partial: "Partially Paid",
  paid: "Paid",
};

const scheduleStatusLabel: Record<string, string> = {
  pending_approval: "Pending MD Approval",
  partially_approved: "Partially Approved",
  approved: "Approved",
  paid: "Partially Paid",
  completed: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function OverheadExpensePrintPage() {
  const { id } = useParams<{ id: string }>();
  const expenseId = Number.parseInt(id, 10);
  const { data, isLoading } = useGetOverheadExpenses();

  const expense = useMemo(
    () => data?.expenses.find(item => item.id === expenseId) ?? null,
    [data?.expenses, expenseId],
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Loader2 style={{ width: 32, height: 32, animation: "spin 1s linear infinite", color: "#64748b" }} />
      </div>
    );
  }

  if (!expense) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Overhead expense not found.
      </div>
    );
  }

  const moneyAddedTotal = expense.topups.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const originalAmount = Math.max(0, expense.amount - moneyAddedTotal);
  const generatedAt = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const topupsOldestFirst = [...expense.topups].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const paymentsOldestFirst = [...expense.payments].sort(
    (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime(),
  );
  const schedulesNewestFirst = [...expense.paymentSchedules].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; background: #f3f4f6; margin: 0; color: #172033; }
        .page { max-width: 980px; margin: 30px auto; background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(15,23,42,0.12); padding: 44px 50px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; max-width: none !important; padding: 28px 34px !important; }
        }
        .action-bar { position: fixed; top: 20px; right: 28px; display: flex; gap: 10px; z-index: 10; }
        .btn { border: 0; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #dbe3ef; }
        .btn-print { background: #2563eb; color: #fff; }
        .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
        .brand { font-size: 24px; font-weight: 900; color: #2563eb; letter-spacing: -0.4px; }
        .sub { margin-top: 3px; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.7; }
        .doc-title { font-size: 20px; font-weight: 900; color: #172033; }
        .doc-ref { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #0f172a; font-weight: 800; }
        .status { display: inline-block; margin-top: 8px; padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; }
        .status-unpaid { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .status-partial { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .status-paid { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }
        .label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
        .main-text { font-size: 15px; font-weight: 800; color: #172033; }
        .muted { font-size: 12px; color: #64748b; line-height: 1.55; }
        .summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 22px 0; }
        .summary-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 13px 14px; background: #fff; }
        .summary-card .value { font-size: 15px; font-weight: 900; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .value-green { color: #16a34a; }
        .value-red { color: #ef4444; }
        .value-blue { color: #2563eb; }
        .value-amber { color: #d97706; }
        .section { margin-top: 24px; }
        .section-title { font-size: 12px; font-weight: 900; color: #334155; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 9px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; text-transform: uppercase; }
        td { border-bottom: 1px solid #edf2f7; color: #334155; font-size: 12px; padding: 9px 10px; vertical-align: top; }
        td.amount, th.amount { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 800; }
        .empty { color: #94a3b8; font-size: 12px; padding: 10px 0; }
        .totals { display: flex; justify-content: flex-end; margin-top: 24px; }
        .totals-box { width: 340px; border-top: 2px solid #2563eb; padding-top: 10px; }
        .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #334155; }
        .totals-row strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .footer { margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 14px; color: #94a3b8; font-size: 11px; text-align: center; }
        @media (max-width: 760px) {
          .page { margin: 0; border-radius: 0; padding: 28px 20px; }
          .header, .info-card { grid-template-columns: 1fr; display: block; }
          .meta { text-align: left; margin-top: 16px; }
          .summary { grid-template-columns: 1fr 1fr; }
          .action-bar { position: static; padding: 12px; justify-content: flex-end; background: #fff; }
        }
      `}</style>

      <div className="action-bar no-print">
        <a className="btn btn-back" href="/overhead-expenses">Back to Overhead</a>
        <button className="btn btn-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <main className="page">
        <header className="header">
          <div>
            <div className="brand">Cost Management</div>
            <div className="sub">Overhead expense payment statement</div>
          </div>
          <div className="meta">
            <div className="doc-title">Overhead Expense Statement</div>
            <div>Reference: <span className="doc-ref">OHE-{expense.id}</span></div>
            <div>Generated: {generatedAt}</div>
            <span className={`status status-${expense.status}`}>{statusLabel[expense.status]}</span>
          </div>
        </header>

        <section className="info-card">
          <div>
            <div className="label">Expense Details</div>
            <div className="main-text">{expense.description}</div>
            <div className="muted">
              Category/Person: {expense.category}<br />
              Created: {fmtDate(expense.createdAt, true)}
              {expense.recordedByName ? ` by ${expense.recordedByName}` : ""}
              {expense.reference ? <><br />Reference: {expense.reference}</> : null}
            </div>
          </div>
          <div>
            <div className="label">Branch</div>
            <div className="main-text">{expense.branchName ?? "All branches"}</div>
            <div className="muted">
              MD approved but unpaid money is shown separately and is not counted as paid until Accounts records payment.
            </div>
          </div>
        </section>

        <section className="summary">
          <div className="summary-card">
            <div className="label">Original Amount</div>
            <div className="value value-blue">{fmt(originalAmount)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Money Added</div>
            <div className="value value-blue">{fmt(moneyAddedTotal)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Current Total</div>
            <div className="value">{fmt(expense.amount)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Amount Paid</div>
            <div className="value value-green">{fmt(expense.totalPaid)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Outstanding</div>
            <div className="value value-red">{fmt(expense.balance)}</div>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">Money Added</h2>
          {topupsOldestFirst.length === 0 ? (
            <div className="empty">No extra money has been added to this overhead record.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Added By</th>
                  <th className="amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {topupsOldestFirst.map(item => (
                  <tr key={item.id}>
                    <td>{fmtDate(item.createdAt)}</td>
                    <td>{item.description}</td>
                    <td>{item.recordedByName ?? "-"}</td>
                    <td className="amount">{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="section">
          <h2 className="section-title">Payment History</h2>
          {paymentsOldestFirst.length === 0 ? (
            <div className="empty">No payment has been recorded for this overhead expense.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date Paid</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th>Recorded By</th>
                  <th className="amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentsOldestFirst.map(payment => (
                  <tr key={payment.id}>
                    <td>{fmtDate(payment.paidAt)}</td>
                    <td>{payment.paymentMethod === "bank" ? (payment.bankName ?? "Bank") : "Cash"}</td>
                    <td>{payment.notes ?? "-"}</td>
                    <td>{payment.recordedByName ?? "-"}</td>
                    <td className="amount">{fmt(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="section">
          <h2 className="section-title">Scheduled Payments And MD Approvals</h2>
          {schedulesNewestFirst.length === 0 ? (
            <div className="empty">No payment schedule is linked to this overhead expense.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Schedule Date</th>
                  <th>Status</th>
                  <th>MD Comment</th>
                  <th className="amount">Requested</th>
                  <th className="amount">Approved</th>
                  <th className="amount">Paid</th>
                  <th className="amount">Balance</th>
                </tr>
              </thead>
              <tbody>
                {schedulesNewestFirst.map(schedule => (
                  <tr key={schedule.id}>
                    <td>{fmtDate(schedule.scheduleDate)}</td>
                    <td>{scheduleStatusLabel[schedule.status] ?? schedule.status.replace(/_/g, " ")}</td>
                    <td>{schedule.latestComment ?? "-"}</td>
                    <td className="amount">{fmt(schedule.amountRequested)}</td>
                    <td className="amount">{fmt(schedule.amountApproved)}</td>
                    <td className="amount">{fmt(schedule.amountPaid)}</td>
                    <td className="amount">{fmt(schedule.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="totals">
          <div className="totals-box">
            <div className="totals-row"><span>Original Amount</span><strong>{fmt(originalAmount)}</strong></div>
            <div className="totals-row"><span>Money Added</span><strong>{fmt(moneyAddedTotal)}</strong></div>
            <div className="totals-row"><span>Current Expense Total</span><strong>{fmt(expense.amount)}</strong></div>
            <div className="totals-row"><span>Total Paid</span><strong>{fmt(expense.totalPaid)}</strong></div>
            <div className="totals-row"><span>Outstanding Balance</span><strong>{fmt(expense.balance)}</strong></div>
            {expense.scheduledPendingApprovedTotal > 0 && (
              <div className="totals-row"><span>Approved Pending Payment</span><strong>{fmt(expense.scheduledPendingApprovedTotal)}</strong></div>
            )}
          </div>
        </section>

        <footer className="footer">
          This statement is generated from Overhead Expenses payment records. Approved scheduled payments are not treated as paid until the payment is recorded.
        </footer>
      </main>
    </>
  );
}
