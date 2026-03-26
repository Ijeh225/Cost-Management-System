import { useGetVatSummary } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "\u2014";

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return { from: p.get("from") ?? undefined, to: p.get("to") ?? undefined };
}

export default function VatSummaryPrint() {
  const { from, to } = useQueryParams();
  const { data, isLoading, isError } = useGetVatSummary({ from, to });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating VAT summary…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load VAT summary. Please close this tab and try again.
      </div>
    );
  }

  const { period, invoices, totals } = data;

  const periodLabel = (() => {
    if (period.from && period.to) return `${fmtDate(period.from)} \u2013 ${fmtDate(period.to)}`;
    if (period.from) return `From ${fmtDate(period.from)}`;
    if (period.to) return `Up to ${fmtDate(period.to)}`;
    return "All Time";
  })();

  const vatRate = totals.totalSubtotal > 0 && totals.totalVat > 0
    ? ((totals.totalVat / totals.totalSubtotal) * 100).toFixed(1)
    : null;

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
        .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
        .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
        .summary-card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
        .summary-card .val { font-size: 18px; font-weight: 800; font-family: monospace; color: #1e293b; }
        .summary-card.vat .val { color: #1d4ed8; }
        .summary-card.total .val { color: #0f766e; }
        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; }
        thead th.right { text-align: right; }
        tbody td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
        tbody td.right { text-align: right; font-family: monospace; }
        tbody td.mono { font-family: monospace; }
        tbody tr:last-child td { border-bottom: none; }
        tfoot td { padding: 10px 10px; border-top: 2px solid #e2e8f0; font-weight: 700; font-size: 13px; }
        tfoot td.right { text-align: right; font-family: monospace; }
        .vat-note { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #1d4ed8; margin-bottom: 20px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
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
            <div className="report-title">VAT Summary Report</div>
            <div className="report-sub">For FIRS Filing · {periodLabel}</div>
            <div className="report-sub">Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="lbl">Total Invoiced (excl. VAT)</div>
            <div className="val">{fmt(totals.totalSubtotal)}</div>
          </div>
          <div className="summary-card vat">
            <div className="lbl">Total VAT Collected{vatRate ? ` (${vatRate}%)` : ""}</div>
            <div className="val">{fmt(totals.totalVat)}</div>
          </div>
          <div className="summary-card total">
            <div className="lbl">Grand Total (incl. VAT)</div>
            <div className="val">{fmt(totals.totalInvoiced)}</div>
          </div>
        </div>

        {totals.totalVat > 0 && (
          <div className="vat-note">
            VAT payable to FIRS for period {periodLabel}: <strong>{fmt(totals.totalVat)}</strong>
            {vatRate && ` (effective rate: ${vatRate}%)`}
          </div>
        )}

        <div className="section-heading">Invoice Breakdown</div>
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
                <th>Client</th>
                <th>Status</th>
                <th className="right">Subtotal (₦)</th>
                <th className="right">VAT (₦)</th>
                <th className="right">Total (₦)</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{fmtDate(inv.createdAt)}</td>
                  <td>{inv.clientName}</td>
                  <td style={{ textTransform: "capitalize" }}>{inv.status}</td>
                  <td className="right">{fmt(inv.subtotal)}</td>
                  <td className="right" style={{ color: inv.vatAmount > 0 ? "#1d4ed8" : "#94a3b8" }}>
                    {fmt(inv.vatAmount)}
                  </td>
                  <td className="right" style={{ fontWeight: 600 }}>{fmt(inv.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight: 700, color: "#475569" }}>TOTALS ({invoices.length} invoice{invoices.length !== 1 ? "s" : ""})</td>
                <td className="right">{fmt(totals.totalSubtotal)}</td>
                <td className="right" style={{ color: "#1d4ed8" }}>{fmt(totals.totalVat)}</td>
                <td className="right" style={{ color: "#0f766e" }}>{fmt(totals.totalInvoiced)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="footer">
          <p>Bonded Terminal Clearing · VAT Summary Report · For FIRS Filing Use Only</p>
          <p style={{ marginTop: 4 }}>{periodLabel} · Generated {new Date().toLocaleDateString("en-NG")}</p>
        </div>
      </div>
    </>
  );
}
