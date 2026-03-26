import { useGetDeliveryReport } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "\u2014";

const fmtShort = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return { from: p.get("from") ?? undefined, to: p.get("to") ?? undefined };
}

export default function DeliveryReportPrint() {
  const { from, to } = useQueryParams();
  const { data, isLoading, isError } = useGetDeliveryReport(from, to);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating delivery report…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load delivery report. Please close this tab and try again.
      </div>
    );
  }

  const periodLabel = (() => {
    if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
    if (from) return `From ${fmtDate(from)}`;
    if (to) return `Up to ${fmtDate(to)}`;
    return "All Time";
  })();

  const printedAt = new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        body { margin: 0; }
      `}</style>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", maxWidth: 900, margin: "0 auto", padding: "40px 32px", color: "#1e293b", background: "#fff", minHeight: "100vh" }}>
        {/* Print button */}
        <div className="no-print" style={{ marginBottom: 24, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => window.print()} style={{ padding: "8px 18px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
            Print / Save PDF
          </button>
          <button onClick={() => window.close()} style={{ padding: "8px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
            Close
          </button>
        </div>

        {/* Header */}
        <div style={{ borderBottom: "3px solid #1e40af", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: -0.5 }}>Delivery Report</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Period: {periodLabel}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Generated on</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{printedAt}</div>
            </div>
          </div>
        </div>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Total Deliveries", value: String(data.count), mono: false },
            { label: "Total Revenue", value: fmt(data.totalRevenue), mono: true },
            { label: "Avg. Days to Deliver", value: data.avgDays !== null ? `${data.avgDays} days` : "N/A", mono: false },
          ].map(card => (
            <div key={card.label} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", background: "#f8fafc" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: card.mono ? 17 : 20, fontWeight: 700, color: "#1e40af", fontFamily: card.mono ? "monospace" : "inherit" }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {data.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 14 }}>
            No deliveries found for the selected period.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                {["#", "Container / BL", "Customer", "Date Delivered", "Days", "Revenue (₦)", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "Revenue (₦)" || h === "Days" ? "right" : "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{i + 1}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 600, color: "#1e40af" }}>{item.containerNumber}</div>
                    <div style={{ color: "#94a3b8", fontSize: 11 }}>{item.blNumber}</div>
                  </td>
                  <td style={{ padding: "7px 10px", fontWeight: 500 }}>{item.clientName}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <div style={{ fontWeight: 500 }}>{fmtShort(item.deliveredAt)}</div>
                    {item.deliveredAtEstimated && (
                      <div style={{ fontSize: 10, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, display: "inline-block", padding: "1px 6px", marginTop: 2 }}>estimated</div>
                    )}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>{item.daysToComplete !== null ? item.daysToComplete : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "monospace", color: "#1e40af" }}>{fmt(item.clearingCharges)}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: item.status === "completed" || item.status === "closed" ? "#059669" : "#64748b", background: item.status === "completed" || item.status === "closed" ? "#d1fae5" : "#f1f5f9", border: `1px solid ${item.status === "completed" || item.status === "closed" ? "#a7f3d0" : "#e2e8f0"}`, borderRadius: 10, padding: "2px 8px" }}>
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#475569" }}>Total Revenue</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#1e40af" }}>{fmt(data.totalRevenue)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
          <span>Bonded Terminal Clearing System — Delivery Report</span>
          <span>Confidential</span>
        </div>
      </div>
    </>
  );
}
