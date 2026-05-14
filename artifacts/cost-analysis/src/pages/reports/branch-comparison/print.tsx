import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

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

function downloadCsv(rows: Row[], totals: Response["totals"], filename: string) {
  const headers = ["Branch", "Status", "Containers", "Revenue (₦)", "Costs (₦)", "Gross Profit (₦)", "Margin %", "Avg Turnaround (days)", "Outstanding AR (₦)"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      esc(r.branchName),
      esc(r.isActive ? "Active" : "Inactive"),
      r.containers,
      r.revenue.toFixed(2),
      r.costs.toFixed(2),
      r.grossProfit.toFixed(2),
      r.marginPct.toFixed(2),
      r.avgTurnaroundDays.toFixed(1),
      r.outstandingReceivables.toFixed(2),
    ].join(","));
  }
  lines.push([
    esc("TOTAL"), esc(""), totals.containers,
    totals.revenue.toFixed(2), totals.costs.toFixed(2),
    totals.grossProfit.toFixed(2), "", "", totals.outstandingReceivables.toFixed(2),
  ].join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
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
        Generating branch comparison report…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load branch comparison report. Please close this tab and try again.
      </div>
    );
  }

  const { rows, totals, period, generatedAt } = data;

  const periodLabel = (() => {
    if (period.from && period.to) return `${fmtDate(period.from)} \u2013 ${fmtDate(period.to)}`;
    if (period.from) return `From ${fmtDate(period.from)}`;
    if (period.to) return `Up to ${fmtDate(period.to)}`;
    return "All Time";
  })();

  const csvFilename = `branch-comparison-${(period.from ?? "all")}_${(period.to ?? "all")}.csv`;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; color: #1e293b; }
        .page { max-width: 1100px; margin: 30px auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 48px 52px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 32px 40px !important; max-width: 100% !important; }
          .section { page-break-inside: avoid; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 20px; margin-bottom: 28px; }
        .company-name { font-size: 22px; font-weight: 900; color: #0f766e; letter-spacing: -0.5px; margin: 0 0 2px 0; }
        .company-sub { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .report-title { font-size: 18px; font-weight: 800; color: #1e293b; text-align: right; }
        .report-sub { font-size: 12px; color: #64748b; margin-top: 4px; text-align: right; }
        .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
        .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
        .summary-card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
        .summary-card .val { font-size: 18px; font-weight: 800; font-family: monospace; color: #1e293b; }
        .summary-card.rev .val { color: #0f766e; }
        .summary-card.costs .val { color: #d97706; }
        .summary-card.profit .val { color: #1d4ed8; }
        .summary-card.profit.negative .val { color: #dc2626; }
        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 10px 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; white-space: nowrap; }
        thead th.right { text-align: right; }
        tbody td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
        tbody td.right { text-align: right; font-family: monospace; }
        tbody td.pos { color: #059669; font-weight: 600; font-family: monospace; text-align: right; }
        tbody td.neg { color: #dc2626; font-weight: 600; font-family: monospace; text-align: right; }
        tbody td.amber { color: #d97706; font-family: monospace; text-align: right; }
        tbody td.green { color: #0f766e; font-family: monospace; text-align: right; }
        tbody tr:nth-child(even) { background: #fafafa; }
        tbody tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 5px; border-radius: 3px; border: 1px solid #e2e8f0; color: #94a3b8; margin-left: 6px; vertical-align: middle; }
        tfoot td { padding: 11px 12px; border-top: 2px solid #e2e8f0; font-weight: 800; font-size: 13px; background: #f8fafc; }
        tfoot td.right { text-align: right; font-family: monospace; }
        tfoot td.pos { color: #059669; font-weight: 800; font-family: monospace; text-align: right; }
        tfoot td.neg { color: #dc2626; font-weight: 800; font-family: monospace; text-align: right; }
        tfoot td.amber { color: #d97706; font-family: monospace; text-align: right; }
        tfoot td.green { color: #0f766e; font-family: monospace; text-align: right; }
        .empty { text-align: center; padding: 32px 0; color: #94a3b8; font-size: 13px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .footer .note { margin-top: 6px; font-style: italic; color: #b8b8b8; }
        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-csv { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
      `}</style>

      <div className="action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>← Close</button>
        <button className="btn-csv" onClick={() => downloadCsv(rows, totals, csvFilename)}>Download CSV</button>
        <button className="btn-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="page">
        <div className="header">
          <div>
            <div className="company-name">Bonded Terminal Clearing</div>
            <div className="company-sub">Nigerian Port Clearing Services</div>
          </div>
          <div>
            <div className="report-title">Branch Comparison Report</div>
            <div className="report-sub">{periodLabel}</div>
            <div className="report-sub">Scope: All Branches — Consolidated</div>
            <div className="report-sub">Generated: {fmtDate(generatedAt ?? new Date().toISOString())}</div>
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="lbl">Total Containers</div>
            <div className="val">{totals.containers.toLocaleString()}</div>
          </div>
          <div className="summary-card rev">
            <div className="lbl">Total Revenue</div>
            <div className="val">{fmt(totals.revenue)}</div>
          </div>
          <div className="summary-card costs">
            <div className="lbl">Total Costs</div>
            <div className="val">{fmt(totals.costs)}</div>
          </div>
          <div className={`summary-card profit${totals.grossProfit < 0 ? " negative" : ""}`}>
            <div className="lbl">Total Gross Profit</div>
            <div className="val">{fmt(totals.grossProfit)}</div>
          </div>
        </div>

        <div className="section">
          <div className="section-heading">Branch-by-Branch Breakdown ({rows.length} branch{rows.length !== 1 ? "es" : ""})</div>
          {rows.length === 0 ? (
            <div className="empty">No branch data available for the selected period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="right">Containers</th>
                  <th className="right">Revenue (₦)</th>
                  <th className="right">Costs (₦)</th>
                  <th className="right">Gross Profit (₦)</th>
                  <th className="right">Margin %</th>
                  <th className="right">Avg Turnaround</th>
                  <th className="right">Outstanding AR (₦)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.branchId}>
                    <td>
                      {r.branchName}
                      {!r.isActive && <span className="badge">inactive</span>}
                    </td>
                    <td className="right">{r.containers}</td>
                    <td className="green">{fmt(r.revenue)}</td>
                    <td className="amber">{fmt(r.costs)}</td>
                    <td className={r.grossProfit >= 0 ? "pos" : "neg"}>{fmt(r.grossProfit)}</td>
                    <td className={r.marginPct >= 0 ? "pos" : "neg"}>{r.marginPct.toFixed(1)}%</td>
                    <td className="right">{r.avgTurnaroundDays > 0 ? `${r.avgTurnaroundDays.toFixed(1)}d` : "\u2014"}</td>
                    <td className="amber">{fmt(r.outstandingReceivables)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL ({rows.length} branch{rows.length !== 1 ? "es" : ""})</td>
                  <td className="right">{totals.containers}</td>
                  <td className="green">{fmt(totals.revenue)}</td>
                  <td className="amber">{fmt(totals.costs)}</td>
                  <td className={totals.grossProfit >= 0 ? "pos" : "neg"}>{fmt(totals.grossProfit)}</td>
                  <td className="right">
                    {totals.revenue > 0 ? `${((totals.grossProfit / totals.revenue) * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                  <td className="right">\u2014</td>
                  <td className="amber">{fmt(totals.outstandingReceivables)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="footer">
          <p>Bonded Terminal Clearing System · Branch Comparison Report · {periodLabel} · All Branches</p>
          <p style={{ marginTop: 4 }}>
            {rows.length} branch{rows.length !== 1 ? "es" : ""} · Total Revenue:{" "}
            <strong style={{ color: "#0f766e" }}>{fmt(totals.revenue)}</strong>
            {" · "}Gross Profit:{" "}
            <strong style={{ color: totals.grossProfit >= 0 ? "#059669" : "#dc2626" }}>{fmt(totals.grossProfit)}</strong>
          </p>
          <p className="note">This report is for internal executive use only. Revenue figures are based on invoiced amounts (ex-VAT). Costs include all container disbursements recorded in the system.</p>
        </div>
      </div>
    </>
  );
}
