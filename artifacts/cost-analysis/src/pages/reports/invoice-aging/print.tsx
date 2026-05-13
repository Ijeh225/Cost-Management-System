import { useGetInvoiceAging, type AgingRow } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "\u2014";

const BUCKET_CONFIG = [
  { key: "current" as const,   label: "Current (Not Overdue)",     color: "#15803d", bg: "#f0fdf4" },
  { key: "days1to30" as const, label: "1\u201330 Days Overdue",    color: "#854d0e", bg: "#fef9c3" },
  { key: "days31to60" as const,label: "31\u201360 Days Overdue",   color: "#c2410c", bg: "#fff7ed" },
  { key: "days61to90" as const,label: "61\u201390 Days Overdue",   color: "#b91c1c", bg: "#fee2e2" },
  { key: "days90plus" as const, label: "Over 90 Days Overdue",     color: "#7f1d1d", bg: "#fef2f2" },
];

function AgingBucket({ label, rows, total, color, bg }: { label: string; rows: AgingRow[]; total: number; color: string; bg: string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: bg, border: `1px solid ${color}40`, borderRadius: "6px 6px 0 0", marginBottom: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{label}</span>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color }}>{fmt(total)}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: "7px 10px", textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Invoice #</th>
            <th style={{ padding: "7px 10px", textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Client</th>
            <th style={{ padding: "7px 10px", textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Due Date</th>
            <th style={{ padding: "7px 10px", textAlign: "right", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Days Overdue</th>
            <th style={{ padding: "7px 10px", textAlign: "right", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Invoice Amt (₦)</th>
            <th style={{ padding: "7px 10px", textAlign: "right", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b" }}>Outstanding (₦)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace", color: "#0f766e" }}>{r.invoiceNumber}</td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>{r.clientName}</td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", color: "#64748b" }}>{fmtDate(r.dueDate)}</td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700, color: r.daysOverdue > 60 ? "#b91c1c" : r.daysOverdue > 30 ? "#c2410c" : r.daysOverdue > 0 ? "#854d0e" : "#15803d" }}>
                {r.daysOverdue > 0 ? `${r.daysOverdue}d` : "\u2014"}
              </td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontFamily: "monospace" }}>{fmt(r.total)}</td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color }}>{fmt(r.outstanding)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#475569", borderTop: "1px solid #e2e8f0" }}>Bucket Subtotal</td>
            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color, borderTop: "1px solid #e2e8f0" }}>{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function InvoiceAgingPrint() {
  const { data, isLoading, isError } = useGetInvoiceAging();

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating aging report…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load aging report. Please close this tab and try again.
      </div>
    );
  }

  const { buckets, totals, generatedAt } = data;

  const totalUnpaidCount = BUCKET_CONFIG.reduce((s, b) => s + buckets[b.key].length, 0);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; color: #1e293b; }
        .page { max-width: 980px; margin: 30px auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 48px 52px; }
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
        .summary-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 28px; }
        .strip-card { border-radius: 6px; padding: 12px 14px; text-align: center; }
        .strip-card .slbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin-bottom: 6px; }
        .strip-card .sval { font-size: 15px; font-weight: 800; font-family: monospace; }
        .grand-total-row { display: flex; justify-content: space-between; align-items: center; background: #1e293b; color: #fff; border-radius: 8px; padding: 14px 20px; margin-bottom: 28px; }
        .grand-total-row .lbl { font-size: 14px; font-weight: 600; }
        .grand-total-row .val { font-size: 22px; font-weight: 900; font-family: monospace; }
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
            <div className="report-title">Invoice Aging Report</div>
            <div className="report-sub">Branch: {(data as { branchScope?: { name: string } } | undefined)?.branchScope?.name ?? "All Branches — Consolidated"}</div>
            <div className="report-sub">As at {fmtDate(generatedAt)}</div>
            <div className="report-sub">{totalUnpaidCount} unpaid invoice{totalUnpaidCount !== 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="summary-strip">
          {BUCKET_CONFIG.map(b => (
            <div key={b.key} className="strip-card" style={{ background: b.bg, border: `1px solid ${b.color}30` }}>
              <div className="slbl" style={{ color: b.color }}>{b.label.split("(")[0].trim().replace(" Days Overdue", "d").replace("Current", "Current").replace("Over 90", "90+d")}</div>
              <div className="sval" style={{ color: b.color }}>{fmt(totals[b.key])}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{buckets[b.key].length} inv.</div>
            </div>
          ))}
        </div>

        <div className="grand-total-row">
          <span className="lbl">Total Outstanding Balance ({totalUnpaidCount} invoices)</span>
          <span className="val">{fmt(totals.grandTotal)}</span>
        </div>

        {BUCKET_CONFIG.map(b => (
          <AgingBucket
            key={b.key}
            label={b.label}
            rows={buckets[b.key]}
            total={totals[b.key]}
            color={b.color}
            bg={b.bg}
          />
        ))}

        <div className="footer">
          <p>Bonded Terminal Clearing · Invoice Aging Report · Snapshot as at {fmtDate(generatedAt)}</p>
          <p style={{ marginTop: 4 }}>All amounts in Nigerian Naira (₦) · Confidential</p>
        </div>
      </div>
    </>
  );
}
