import { Fragment } from "react";
import { useGetClientStatement } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "\u2014";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", partial: "Partially Paid",
  overdue: "Overdue", written_off: "Written Off",
};

const METHOD_LABEL: Record<string, string> = {
  transfer: "Bank Transfer", cash: "Cash", cheque: "Cheque", pos: "POS",
  credit_note: "Credit Note", deposit: "Client Deposit",
};

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return {
    clientId: parseInt(p.get("clientId") ?? "0", 10),
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  };
}

export default function ClientStatementPrint() {
  const { clientId, from, to } = useQueryParams();
  const { data, isLoading, isError } = useGetClientStatement(
    clientId > 0 ? { clientId, from, to } : null
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating statement…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load client statement. Please close this tab and try again.
      </div>
    );
  }

  const { client, period, invoices, totals } = data;

  const periodLabel = (() => {
    if (period.from && period.to) return `${fmtDate(period.from)} – ${fmtDate(period.to)}`;
    if (period.from) return `From ${fmtDate(period.from)}`;
    if (period.to) return `Up to ${fmtDate(period.to)}`;
    return "All Time";
  })();

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; color: #1e293b; }
        .page { max-width: 900px; margin: 30px auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 48px 52px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 32px 40px !important; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 20px; margin-bottom: 28px; }
        .company-name { font-size: 22px; font-weight: 900; color: #0f766e; letter-spacing: -0.5px; margin: 0 0 2px 0; }
        .company-sub { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .report-title { font-size: 18px; font-weight: 800; color: #1e293b; text-align: right; }
        .report-sub { font-size: 12px; color: #64748b; margin-top: 4px; text-align: right; }
        .client-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; }
        .client-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; margin: 0 0 8px 0; }
        .client-name { font-size: 16px; font-weight: 700; color: #1e293b; }
        .client-detail { font-size: 12px; color: #64748b; margin-top: 3px; }
        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; }
        thead th.right { text-align: right; }
        tbody td { font-size: 12px; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
        tbody td.right { text-align: right; font-family: monospace; }
        tbody td.mono { font-family: monospace; }
        tbody tr:last-child td { border-bottom: none; }
        .payments-row td { background: #fafafa; font-size: 11px; color: #64748b; }
        .totals-box { margin-left: auto; width: 300px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .totals-row { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 14px; border-bottom: 1px solid #f1f5f9; }
        .totals-row:last-child { border-bottom: none; }
        .totals-row.closing { background: #f0fdf4; font-weight: 800; font-size: 15px; color: #15803d; }
        .totals-row.closing.debt { background: #fff7ed; color: #ea580c; }
        .totals-row .lbl { color: #64748b; }
        .totals-row .val { font-family: monospace; font-weight: 600; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
        .status-paid { color: #15803d; font-weight: 700; }
        .status-overdue { color: #b91c1c; font-weight: 700; }
        .status-partial { color: #1d4ed8; font-weight: 700; }
        .status-draft { color: #475569; }
        .status-sent { color: #854d0e; }
        .status-written_off { color: #64748b; font-style: italic; }
      `}</style>

      <div className="action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>
          ← Close
        </button>
        <button className="btn-print" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <div className="page">
        <div className="header">
          <div>
            <div className="company-name">Bonded Terminal Clearing</div>
            <div className="company-sub">Nigerian Port Clearing Services</div>
          </div>
          <div>
            <div className="report-title">Client Statement</div>
            <div className="report-sub">{periodLabel}</div>
            <div className="report-sub">Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="client-block">
          <h3>Statement For</h3>
          <div className="client-name">{client.name}</div>
          {client.contactName && <div className="client-detail">Contact: {client.contactName}</div>}
          {client.contactPhone && <div className="client-detail">{client.contactPhone}</div>}
          {client.contactEmail && <div className="client-detail">{client.contactEmail}</div>}
          {client.address && <div className="client-detail">{client.address}</div>}
        </div>

        <div className="section-heading">Invoice History</div>
        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
            No invoices found for this period.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th className="right">Amount (₦)</th>
                <th className="right">Paid (₦)</th>
                <th className="right">Balance (₦)</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <Fragment key={inv.id}>
                  <tr>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{fmtDate(inv.createdAt)}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td>
                      <span className={`status-${inv.status}`}>{STATUS_LABEL[inv.status] ?? inv.status}</span>
                    </td>
                    <td className="right">{fmt(inv.total)}</td>
                    <td className="right" style={{ color: inv.totalPaid > 0 ? "#15803d" : undefined }}>{fmt(inv.totalPaid)}</td>
                    <td className="right" style={{ color: inv.outstanding > 0 ? "#ea580c" : "#15803d", fontWeight: 700 }}>{fmt(inv.outstanding)}</td>
                  </tr>
                  {inv.payments.length > 0 && inv.payments.map(p => (
                    <tr key={`p${p.id}`} className="payments-row">
                      <td colSpan={3} style={{ paddingLeft: 24 }}>
                        Payment — {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}{p.reference ? ` · Ref: ${p.reference}` : ""}
                      </td>
                      <td>{fmtDate(p.paidAt)}</td>
                      <td></td>
                      <td className="right" style={{ color: "#15803d" }}>{fmt(p.amount)}</td>
                      <td></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <div className="totals-box">
            <div className="totals-row">
              <span className="lbl">Total Invoiced</span>
              <span className="val">{fmt(totals.totalInvoiced)}</span>
            </div>
            <div className="totals-row">
              <span className="lbl">Total Paid</span>
              <span className="val" style={{ color: "#15803d" }}>{fmt(totals.totalPaid)}</span>
            </div>
            <div className="totals-row">
              <span className="lbl">Gross Outstanding</span>
              <span className="val" style={{ color: totals.closingBalance > 0 ? "#ea580c" : "#15803d" }}>{fmt(totals.closingBalance)}</span>
            </div>
            {totals.unallocatedDeposits > 0 && (
              <div className="totals-row">
                <span className="lbl">Less: Unallocated Deposits</span>
                <span className="val" style={{ color: "#0369a1" }}>({fmt(totals.unallocatedDeposits)})</span>
              </div>
            )}
            {totals.creditBalance > 0 && (
              <div className="totals-row">
                <span className="lbl">Less: Credit Balance</span>
                <span className="val" style={{ color: "#7c3aed" }}>({fmt(totals.creditBalance)})</span>
              </div>
            )}
            <div className={`totals-row closing${totals.effectiveClosingBalance > 0 ? " debt" : ""}`}>
              <span>{totals.effectiveClosingBalance > 0 ? "Net Balance Owed" : "Fully Settled"}</span>
              <span className="val">{fmt(totals.effectiveClosingBalance)}</span>
            </div>
          </div>
        </div>

        <div className="footer">
          <p>Bonded Terminal Clearing · Client Statement · Confidential</p>
          <p style={{ marginTop: 4 }}>{client.name} · {periodLabel}</p>
        </div>
      </div>
    </>
  );
}
