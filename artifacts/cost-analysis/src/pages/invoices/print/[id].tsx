import { useParams } from "wouter";
import { useGetInvoice } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const fmt = (n: number) =>
  "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "—";

const METHOD_LABEL: Record<string, string> = {
  transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  pos: "POS",
};

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = parseInt(id, 10);
  const { data: invoice, isLoading } = useGetInvoice(isNaN(invoiceId) ? null : invoiceId);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Loader2 style={{ width: 32, height: 32, animation: "spin 1s linear infinite", color: "#64748b" }} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Invoice not found.
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const vatRate = invoice.subtotal > 0 && invoice.vatAmount > 0
    ? ((invoice.vatAmount / invoice.subtotal) * 100).toFixed(1)
    : null;

  const containerRows = invoice.items && invoice.items.length > 0
    ? invoice.items
    : invoice.containerId
      ? [{ id: 0, invoiceId: invoice.id, containerId: invoice.containerId, description: "Clearing Charges", amount: invoice.subtotal, sortOrder: 0, containerNumber: invoice.containerNumber, blNumber: invoice.blNumber }]
      : [];

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

        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 20px; margin-bottom: 28px; }
        .company-name { font-size: 22px; font-weight: 900; color: #0f766e; letter-spacing: -0.5px; margin: 0 0 2px 0; }
        .company-sub { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .invoice-meta { text-align: right; }
        .invoice-number { font-size: 18px; font-weight: 800; color: #1e293b; font-family: monospace; }
        .invoice-date { font-size: 12px; color: #64748b; margin-top: 4px; }

        .status-stamp { display: inline-block; padding: 4px 16px; border-radius: 4px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 8px; }
        .status-paid { background: #dcfce7; color: #15803d; border: 2px solid #16a34a; }
        .status-partial { background: #dbeafe; color: #1d4ed8; border: 2px solid #2563eb; }
        .status-overdue { background: #fee2e2; color: #b91c1c; border: 2px solid #dc2626; }
        .status-draft { background: #f1f5f9; color: #475569; border: 2px solid #94a3b8; }
        .status-sent { background: #fef9c3; color: #854d0e; border: 2px solid #ca8a04; }

        .client-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; display: flex; gap: 32px; }
        .client-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; margin: 0 0 8px 0; }
        .client-name { font-size: 15px; font-weight: 700; color: #1e293b; }
        .client-phone { font-size: 12px; color: #64748b; margin-top: 4px; }
        .dates-block { margin-left: auto; text-align: right; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        thead th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; }
        thead th:last-child { text-align: right; }
        tbody td { font-size: 13px; padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
        tbody td:last-child { text-align: right; font-weight: 600; font-family: monospace; }
        tbody tr:last-child td { border-bottom: none; }

        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }

        .totals { margin-left: auto; width: 280px; }
        .totals-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; color: #334155; }
        .totals-row.divider { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; }
        .totals-row.total-line { font-size: 16px; font-weight: 800; color: #1e293b; padding-top: 8px; border-top: 2px solid #0f766e; margin-top: 4px; }
        .totals-row .label { color: #64748b; }
        .totals-row .value { font-family: monospace; }
        .totals-row.paid-line .value { color: #16a34a; }
        .totals-row.outstanding-line .value { color: #ea580c; font-weight: 700; }

        .paid-banner { text-align: center; margin: 28px 0 16px 0; }
        .paid-watermark { display: inline-block; padding: 10px 40px; border: 5px double #16a34a; border-radius: 8px; font-size: 36px; font-weight: 900; color: #16a34a; letter-spacing: 8px; opacity: 0.85; transform: rotate(-3deg); }
        .outstanding-banner { background: #fff7ed; border: 2px solid #ea580c; border-radius: 8px; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
        .outstanding-banner .label { font-size: 13px; font-weight: 700; color: #9a3412; }
        .outstanding-banner .amount { font-size: 20px; font-weight: 900; font-family: monospace; color: #ea580c; }

        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }

        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
      `}</style>

      <div className="action-bar no-print">
        <a className="btn-back" href={`../invoices/${invoiceId}`} onClick={e => { e.preventDefault(); window.history.back(); }}>
          ← Back
        </a>
        <button className="btn-print" onClick={() => window.print()}>
          🖨 Print / Save PDF
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="company-name">Bonded Terminal Clearing</div>
            <div className="company-sub">Nigerian Port Clearing Services</div>
          </div>
          <div className="invoice-meta">
            <div className="invoice-number">{invoice.invoiceNumber}</div>
            <div className="invoice-date">Issued: {fmtDate(invoice.createdAt)}</div>
            <div>
              <span className={`status-stamp status-${invoice.status}`}>
                {invoice.status === "paid" ? "✓ PAID"
                  : invoice.status === "partial" ? "PARTIALLY PAID"
                  : invoice.status === "overdue" ? "OVERDUE"
                  : invoice.status === "sent" ? "SENT"
                  : "DRAFT"}
              </span>
            </div>
          </div>
        </div>

        {/* Client + Dates */}
        <div className="client-block">
          <div>
            <h3>Billed To</h3>
            <div className="client-name">{invoice.clientName ?? "—"}</div>
            {invoice.clientPhone && <div className="client-phone">📞 {invoice.clientPhone}</div>}
          </div>
          <div className="dates-block">
            <h3>Invoice Dates</h3>
            <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
              <span style={{ color: "#94a3b8" }}>Issued:</span> {fmtDate(invoice.createdAt)}<br />
              {invoice.dueDate && <><span style={{ color: "#94a3b8" }}>Due:</span> {fmtDate(invoice.dueDate)}</>}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="section-heading">Container Clearing Services</div>
        <table>
          <thead>
            <tr>
              <th>Container #</th>
              <th>B/L Number</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {containerRows.map((item, i) => (
              <tr key={item.id || i}>
                <td style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 700 }}>
                  {item.containerNumber ?? "—"}
                </td>
                <td style={{ fontFamily: "monospace", color: "#64748b" }}>
                  {item.blNumber ?? "—"}
                </td>
                <td>{item.description}</td>
                <td>{fmt(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div className="totals">
            <div className="totals-row">
              <span className="label">Subtotal</span>
              <span className="value">{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.vatAmount > 0 && (
              <div className="totals-row">
                <span className="label">VAT {vatRate ? `(${vatRate}%)` : ""}</span>
                <span className="value">{fmt(invoice.vatAmount)}</span>
              </div>
            )}
            <div className="totals-row total-line">
              <span>Total</span>
              <span className="value">{fmt(invoice.total)}</span>
            </div>
            {invoice.totalPaid > 0 && (
              <div className="totals-row paid-line">
                <span className="label">Amount Paid</span>
                <span className="value">{fmt(invoice.totalPaid)}</span>
              </div>
            )}
            {invoice.outstanding > 0 && (
              <div className="totals-row outstanding-line">
                <span className="label">Outstanding</span>
                <span className="value">{fmt(invoice.outstanding)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment History */}
        {invoice.payments.length > 0 && (
          <>
            <div className="section-heading">Payment History</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.paidAt)}</td>
                    <td>{METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}</td>
                    <td style={{ fontFamily: "monospace", color: "#64748b" }}>{p.reference || "—"}</td>
                    <td>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Paid / Outstanding Banner */}
        {isPaid ? (
          <div className="paid-banner">
            <div className="paid-watermark">PAID</div>
          </div>
        ) : invoice.outstanding > 0 ? (
          <div className="outstanding-banner">
            <span className="label">Outstanding Balance</span>
            <span className="amount">{fmt(invoice.outstanding)}</span>
          </div>
        ) : null}

        {/* Notes */}
        {invoice.notes && (
          <div style={{ marginTop: 20, fontSize: 12, color: "#64748b", borderLeft: "3px solid #e2e8f0", paddingLeft: 12 }}>
            <strong style={{ color: "#94a3b8" }}>Notes:</strong> {invoice.notes}
          </div>
        )}

        <div className="footer">
          <p>This is a computer-generated receipt from Bonded Terminal Clearing · Confidential</p>
          <p style={{ marginTop: 4 }}>{invoice.invoiceNumber} · Generated {new Date().toLocaleDateString("en-NG")}</p>
        </div>
      </div>
    </>
  );
}
