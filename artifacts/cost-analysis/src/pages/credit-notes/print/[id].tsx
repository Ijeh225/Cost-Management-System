import { useParams } from "wouter";
import { useGetCreditNoteById } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const fmt = (n: number) =>
  "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function CreditNotePrintPage() {
  const { id } = useParams<{ id: string }>();
  const cnId = parseInt(id, 10);
  const { data: cn, isLoading } = useGetCreditNoteById(isNaN(cnId) ? null : cnId);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Loader2 style={{ width: 32, height: 32, animation: "spin 1s linear infinite", color: "#64748b" }} />
      </div>
    );
  }

  if (!cn) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Credit note not found.
      </div>
    );
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; color: #1e293b; }
        .page { max-width: 860px; margin: 30px auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 48px 52px; position: relative; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 32px 40px !important; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #b45309; padding-bottom: 20px; margin-bottom: 28px; }
        .company-name { font-size: 22px; font-weight: 900; color: #b45309; letter-spacing: -0.5px; margin: 0 0 2px 0; }
        .company-sub { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .doc-meta { text-align: right; }
        .doc-type { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #b45309; font-weight: 700; margin-bottom: 4px; }
        .doc-number { font-size: 18px; font-weight: 800; color: #1e293b; font-family: monospace; }
        .doc-date { font-size: 12px; color: #64748b; margin-top: 4px; }
        .client-block { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; display: flex; gap: 32px; }
        .client-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #92400e; font-weight: 600; margin: 0 0 8px 0; }
        .client-name { font-size: 15px; font-weight: 700; color: #1e293b; }
        .ref-block { margin-left: auto; text-align: right; }
        .ref-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #92400e; font-weight: 600; margin: 0 0 4px 0; }
        .ref-value { font-family: monospace; font-size: 14px; font-weight: 700; color: #1e293b; }
        .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin: 0 0 12px 0; }
        .reason-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; }
        .reason-text { font-size: 14px; color: #334155; line-height: 1.6; }
        .amount-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
        .amount-table th { background: #fef3c7; color: #92400e; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 16px; text-align: left; font-weight: 700; }
        .amount-table th:last-child { text-align: right; }
        .amount-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .amount-table td:last-child { text-align: right; font-family: monospace; font-weight: 700; font-size: 15px; }
        .amount-table tr.total-row td { background: #fffbeb; font-weight: 800; font-size: 16px; border-top: 2px solid #d97706; border-bottom: none; color: #92400e; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .footer-note { font-size: 11px; color: #94a3b8; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; background: #dcfce7; color: #15803d; border: 1.5px solid #16a34a; }
        .print-btn { position: fixed; bottom: 32px; right: 32px; background: #b45309; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.15); letter-spacing: 0.5px; }
        .print-btn:hover { background: #92400e; }
      `}</style>

      <div className="page">
        <div className="header">
          <div>
            <p className="company-name">Bonded Terminal</p>
            <p className="company-sub">Clearing &amp; Forwarding Services</p>
          </div>
          <div className="doc-meta">
            <p className="doc-type">Credit Note</p>
            <p className="doc-number">{cn.creditNoteNumber}</p>
            <p className="doc-date">Issued: {fmtDate(cn.createdAt)}</p>
          </div>
        </div>

        <div className="client-block">
          <div>
            <h3>Issued To</h3>
            <p className="client-name">{cn.clientName ?? "—"}</p>
          </div>
          {cn.invoiceNumber && (
            <div className="ref-block">
              <p className="ref-label">Original Invoice</p>
              <p className="ref-value">{cn.invoiceNumber}</p>
            </div>
          )}
        </div>

        <div className="reason-box">
          <p className="section-title">Reason for Credit Note</p>
          <p className="reason-text">{cn.reason}</p>
        </div>

        <table className="amount-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Credit adjustment against {cn.invoiceNumber ? `invoice ${cn.invoiceNumber}` : "original invoice"}
                {cn.reason ? ` — ${cn.reason}` : ""}
              </td>
              <td>{fmt(cn.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td>Total Credit</td>
              <td>{fmt(cn.amount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="footer">
          <div>
            <p className="footer-note">This credit note reduces the outstanding balance on {cn.invoiceNumber ?? "the referenced invoice"}.</p>
            <p className="footer-note">For queries, please contact our accounts department.</p>
          </div>
          <div>
            <span className="status-badge">{cn.status ?? "Active"}</span>
          </div>
        </div>
      </div>

      <button className="print-btn no-print" onClick={() => window.print()}>
        Print / Save PDF
      </button>
    </>
  );
}
