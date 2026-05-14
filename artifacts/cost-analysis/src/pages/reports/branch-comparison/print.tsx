import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type Row = {
  branchId: number;
  branchName: string;
  isActive: boolean;
  containers: number;
  revenue: number;
  costs: number;
  grossProfit: number;
  marginPct: number;
  avgTurnaroundDays: number;
  outstandingReceivables: number;
};

type Response = {
  period: { from: string | null; to: string | null };
  rows: Row[];
  totals: { containers: number; revenue: number; costs: number; grossProfit: number; outstandingReceivables: number };
  generatedAt: string;
};

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  };
}

export default function BranchComparisonPrint() {
  const { from, to } = useQueryParams();

  const { data, isLoading, isError } = useQuery<Response>({
    queryKey: ["branch-comparison-print", from, to],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const q = qs.toString();
      return customFetch<Response>(`/api/reports/branch-comparison${q ? `?${q}` : ""}`);
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating branch comparison…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#ef4444" }}>
        Failed to load branch comparison data.
      </div>
    );
  }

  const { rows, totals, period } = data;
  const periodLabel = period.from || period.to
    ? `${period.from ? new Date(period.from).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Start"} – ${period.to ? new Date(period.to).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Today"}`
    : "All Time";

  const sortedRows = [...rows].sort((a, b) => b.revenue - a.revenue);

  const styles: Record<string, React.CSSProperties> = {
    page: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11px", color: "#1e293b", padding: "32px 40px", maxWidth: "900px", margin: "0 auto", background: "#fff" },
    header: { borderBottom: "2px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" },
    companyName: { fontSize: "20px", fontWeight: 700, color: "#0f172a", margin: 0 },
    reportTitle: { fontSize: "14px", color: "#64748b", margin: "4px 0 0" },
    metaRow: { display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "10px", color: "#94a3b8" },
    summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" },
    summaryCard: { border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px 12px", background: "#f8fafc" },
    summaryLabel: { fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#94a3b8", margin: "0 0 4px" },
    summaryValue: { fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: 0 },
    table: { width: "100%", borderCollapse: "collapse" as const, marginBottom: "24px" },
    th: { textAlign: "left" as const, padding: "8px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#64748b", fontWeight: 600 },
    thRight: { textAlign: "right" as const, padding: "8px 10px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#64748b", fontWeight: 600 },
    td: { padding: "7px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" as const },
    tdRight: { padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" as const, fontFamily: "monospace", verticalAlign: "top" as const },
    tfootTd: { padding: "8px 10px", borderTop: "2px solid #e2e8f0", fontWeight: 700, background: "#f8fafc" },
    tfootTdRight: { padding: "8px 10px", borderTop: "2px solid #e2e8f0", textAlign: "right" as const, fontFamily: "monospace", fontWeight: 700, background: "#f8fafc" },
    footer: { borderTop: "1px solid #e2e8f0", paddingTop: "12px", marginTop: "24px", fontSize: "9px", color: "#94a3b8", display: "flex", justifyContent: "space-between" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <p style={styles.companyName}>Branch Performance Comparison</p>
        <p style={styles.reportTitle}>Cross-Branch Executive Overview — All Branches Side-by-Side</p>
        <div style={styles.metaRow}>
          <span>Period: <strong>{periodLabel}</strong></span>
          <span>Generated: {new Date(data.generatedAt).toLocaleString("en-NG")}</span>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Branches</p>
          <p style={{ ...styles.summaryValue, color: "#0f172a" }}>{rows.length}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Total Containers</p>
          <p style={{ ...styles.summaryValue, color: "#0f172a" }}>{totals.containers.toLocaleString()}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Total Revenue</p>
          <p style={{ ...styles.summaryValue, color: "#0f766e" }}>{fmt(totals.revenue)}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Gross Profit</p>
          <p style={{ ...styles.summaryValue, color: totals.grossProfit >= 0 ? "#0f766e" : "#ef4444" }}>{fmt(totals.grossProfit)}</p>
        </div>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Branch</th>
            <th style={styles.thRight}>Containers</th>
            <th style={styles.thRight}>Revenue (₦)</th>
            <th style={styles.thRight}>Costs (₦)</th>
            <th style={styles.thRight}>Gross Profit (₦)</th>
            <th style={styles.thRight}>Margin %</th>
            <th style={styles.thRight}>Avg Days</th>
            <th style={styles.thRight}>Outstanding AR (₦)</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={r.branchId} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={styles.td}>
                <span style={{ fontWeight: 600 }}>{r.branchName}</span>
                {!r.isActive && <span style={{ fontSize: "9px", color: "#94a3b8", marginLeft: "6px" }}>(inactive)</span>}
              </td>
              <td style={styles.tdRight}>{r.containers}</td>
              <td style={{ ...styles.tdRight, color: "#0f766e" }}>{fmt(r.revenue)}</td>
              <td style={{ ...styles.tdRight, color: "#b45309" }}>{fmt(r.costs)}</td>
              <td style={{ ...styles.tdRight, color: r.grossProfit >= 0 ? "#0f766e" : "#ef4444", fontWeight: 600 }}>{fmt(r.grossProfit)}</td>
              <td style={{ ...styles.tdRight, color: r.marginPct >= 0 ? "#0f766e" : "#ef4444" }}>{fmtPct(r.marginPct)}</td>
              <td style={styles.tdRight}>{r.avgTurnaroundDays > 0 ? `${r.avgTurnaroundDays.toFixed(1)}d` : "—"}</td>
              <td style={{ ...styles.tdRight, color: r.outstandingReceivables > 0 ? "#b45309" : "#64748b" }}>{fmt(r.outstandingReceivables)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={styles.tfootTd}>TOTAL ({rows.length} branches)</td>
            <td style={styles.tfootTdRight}>{totals.containers}</td>
            <td style={{ ...styles.tfootTdRight, color: "#0f766e" }}>{fmt(totals.revenue)}</td>
            <td style={{ ...styles.tfootTdRight, color: "#b45309" }}>{fmt(totals.costs)}</td>
            <td style={{ ...styles.tfootTdRight, color: totals.grossProfit >= 0 ? "#0f766e" : "#ef4444" }}>{fmt(totals.grossProfit)}</td>
            <td style={styles.tfootTdRight}>
              {totals.revenue > 0 ? fmtPct(((totals.grossProfit / totals.revenue) * 100)) : "—"}
            </td>
            <td style={styles.tfootTdRight}>—</td>
            <td style={{ ...styles.tfootTdRight, color: "#b45309" }}>{fmt(totals.outstandingReceivables)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={styles.footer}>
        <span>Cost Analysis ERP — Branch Comparison Report</span>
        <span>Printed {new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      <style>{`@media print { body { margin: 0; } @page { margin: 16mm; size: A4 landscape; } }`}</style>
    </div>
  );
}
