import { useGetProfitLoss, type ProfitLossResponse } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

const fmtMonth = (k: string) => {
  const [y, m] = k.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
};

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    clientId: p.get("clientId") ?? undefined,
    costBasis: p.get("costBasis") ?? undefined,
  };
}

function downloadCsv(data: ProfitLossResponse, filename: string) {
  const lines: string[] = [];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  lines.push("Section,Line,Amount");
  lines.push(`Revenue,Net Sales (excl. VAT),${data.revenue.totalRevenue.toFixed(2)}`);
  lines.push(`Revenue,VAT Collected (liability — not revenue),${data.revenue.totalVatCollected.toFixed(2)}`);
  lines.push(`Revenue,Total Invoiced (incl. VAT),${data.revenue.totalInvoicedInclVat.toFixed(2)}`);
  lines.push(`Cost of Sales,Shipping,${data.costOfSales.shipping.toFixed(2)}`);
  lines.push(`Cost of Sales,Customs (incl. duty),${data.costOfSales.customs.toFixed(2)}`);
  lines.push(`Cost of Sales,Terminal,${data.costOfSales.terminal.toFixed(2)}`);
  lines.push(`Cost of Sales,Delivery,${data.costOfSales.delivery.toFixed(2)}`);
  lines.push(`Cost of Sales,Operations,${data.costOfSales.operations.toFixed(2)}`);
  lines.push(`Cost of Sales,Extra Charges,${data.costOfSales.extras.toFixed(2)}`);
  lines.push(`Cost of Sales,TOTAL Cost of Sales,${data.costOfSales.total.toFixed(2)}`);
  lines.push(`Profit,Gross Profit,${data.grossProfit.toFixed(2)}`);
  lines.push(`Profit,Gross Margin %,${data.grossMarginPct.toFixed(2)}`);
  for (const [cat, amt] of Object.entries(data.overheads.byCategory)) {
    lines.push(`Overheads,${esc(cat)},${amt.toFixed(2)}`);
  }
  lines.push(`Overheads,TOTAL Overheads,${data.overheads.total.toFixed(2)}`);
  lines.push(`Profit,Net Profit,${data.netProfit.toFixed(2)}`);
  lines.push(`Profit,Net Margin %,${data.netMarginPct.toFixed(2)}`);
  lines.push("");
  lines.push("Revenue by Client");
  lines.push("Client,Invoices,Revenue");
  for (const c of data.revenue.byClient) {
    lines.push(`${esc(c.clientName)},${c.invoiceCount},${c.revenue.toFixed(2)}`);
  }
  if (data.monthly.length > 1) {
    lines.push("");
    lines.push("Monthly Breakdown");
    lines.push("Month,Containers,Revenue,Cost of Sales,Gross Profit,Overheads,Net Profit");
    for (const m of data.monthly) {
      lines.push(`${esc(fmtMonth(m.month))},${m.containerCount},${m.revenue.toFixed(2)},${m.costOfSales.toFixed(2)},${m.grossProfit.toFixed(2)},${m.overheads.toFixed(2)},${m.netProfit.toFixed(2)}`);
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function ProfitLossPrint() {
  const { from, to, clientId, costBasis } = useQueryParams();
  const { data, isLoading, isError } = useGetProfitLoss({ from, to, clientId, costBasis });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating P&amp;L statement…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load P&amp;L. Please close this tab and try again.
      </div>
    );
  }

  const { period, revenue, costOfSales, grossProfit, grossMarginPct, overheads, netProfit, netMarginPct, containerCount, avgProfitPerContainer, monthly, clients } = data;

  const periodLabel = (() => {
    if (period.from && period.to) return `${fmtDate(period.from)} \u2013 ${fmtDate(period.to)}`;
    if (period.from) return `From ${fmtDate(period.from)}`;
    if (period.to) return `Up to ${fmtDate(period.to)}`;
    return "All Time";
  })();

  const clientLabel = clientId && clientId !== "all"
    ? (clients.find(c => String(c.id) === String(clientId))?.name ?? `Client #${clientId}`)
    : "All Clients";

  const csvFilename = `pl_${(period.from ?? "all")}_${(period.to ?? "all")}.csv`;
  const sortedOverheads = Object.entries(overheads.byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; color: #1e293b; }
        .page { max-width: 980px; margin: 30px auto; background: #fff; border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 48px 52px; }
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
        .summary-card .val { font-size: 17px; font-weight: 800; font-family: monospace; color: #1e293b; }
        .summary-card .sub { font-size: 10px; color: #94a3b8; margin-top: 4px; font-family: monospace; }
        .summary-card.rev .val { color: #0f766e; }
        .summary-card.cogs .val { color: #d97706; }
        .summary-card.gp .val { color: #1d4ed8; }
        .summary-card.gp.negative .val { color: #dc2626; }
        .summary-card.np .val { color: #059669; }
        .summary-card.np.negative .val { color: #dc2626; }
        .pl-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        .pl-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
        .pl-table td.lbl { color: #475569; }
        .pl-table td.lbl.indent { padding-left: 28px; color: #64748b; font-size: 12px; }
        .pl-table td.amt { text-align: right; font-family: monospace; color: #334155; }
        .pl-table tr.subtotal td { background: #f8fafc; font-weight: 700; border-top: 1px solid #e2e8f0; }
        .pl-table tr.subtotal td.amt { color: #1e293b; }
        .pl-table tr.gross td { background: #eff6ff; font-weight: 800; font-size: 14px; border-top: 2px solid #1d4ed8; border-bottom: 2px solid #1d4ed8; color: #1d4ed8; }
        .pl-table tr.net td { background: #ecfdf5; font-weight: 800; font-size: 15px; border-top: 2px solid #059669; border-bottom: 2px solid #059669; color: #059669; }
        .pl-table tr.net.negative td { background: #fef2f2; border-color: #dc2626; color: #dc2626; }
        .pl-table tr.section-header td { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; padding-top: 18px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        table.data { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        table.data thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; }
        table.data thead th.right { text-align: right; }
        table.data tbody td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
        table.data tbody td.right { text-align: right; font-family: monospace; }
        table.data tbody td.pos { color: #059669; font-weight: 600; }
        table.data tbody td.neg { color: #dc2626; font-weight: 600; }
        table.data tfoot td { padding: 10px; border-top: 2px solid #e2e8f0; font-weight: 700; font-size: 13px; }
        table.data tfoot td.right { text-align: right; font-family: monospace; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .footer .note { margin-top: 6px; font-style: italic; color: #b8b8b8; }
        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-csv { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
      `}</style>

      <div className="action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>← Close</button>
        <button className="btn-csv" onClick={() => downloadCsv(data, csvFilename)}>Download CSV</button>
        <button className="btn-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="page">
        <div className="header">
          <div>
            <div className="company-name">Bonded Terminal Clearing</div>
            <div className="company-sub">Nigerian Port Clearing Services</div>
          </div>
          <div>
            <div className="report-title">Profit &amp; Loss Statement</div>
            <div className="report-sub">{periodLabel}</div>
            <div className="report-sub">Client: {clientLabel}</div>
            <div className="report-sub">Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card rev">
            <div className="lbl">Net Revenue (ex-VAT)</div>
            <div className="val">{fmt(revenue.totalRevenue)}</div>
            <div className="sub">{revenue.invoiceCount} issued invoice{revenue.invoiceCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="summary-card cogs">
            <div className="lbl">Cost of Sales</div>
            <div className="val">{fmt(costOfSales.total)}</div>
            <div className="sub">{containerCount} container{containerCount !== 1 ? "s" : ""}</div>
          </div>
          <div className={`summary-card gp ${grossProfit < 0 ? "negative" : ""}`}>
            <div className="lbl">Gross Profit ({fmtPct(grossMarginPct)})</div>
            <div className="val">{fmt(grossProfit)}</div>
            <div className="sub">Avg/container: {fmt(avgProfitPerContainer)}</div>
          </div>
          <div className={`summary-card np ${netProfit < 0 ? "negative" : ""}`}>
            <div className="lbl">Net Profit ({fmtPct(netMarginPct)})</div>
            <div className="val">{fmt(netProfit)}</div>
            <div className="sub">{overheads.appliedToNet ? "After overheads" : "Pre-overhead (filtered)"}</div>
          </div>
        </div>

        <div className="section">
          <table className="pl-table">
            <tbody>
              <tr className="section-header"><td colSpan={2}>Revenue (Net Sales, ex-VAT)</td></tr>
              <tr>
                <td className="lbl">Net Sales (recognised revenue)</td>
                <td className="amt" style={{ color: "#0f766e", fontWeight: 700 }}>{fmt(revenue.totalRevenue)}</td>
              </tr>
              <tr>
                <td className="lbl indent">VAT Collected (liability, not revenue)</td>
                <td className="amt" style={{ color: "#94a3b8" }}>{fmt(revenue.totalVatCollected)}</td>
              </tr>
              <tr>
                <td className="lbl indent">Total Invoiced (incl. VAT)</td>
                <td className="amt" style={{ color: "#94a3b8" }}>{fmt(revenue.totalInvoicedInclVat)}</td>
              </tr>

              <tr className="section-header"><td colSpan={2}>Cost of Sales</td></tr>
              <tr><td className="lbl indent">Shipping</td><td className="amt">{fmt(costOfSales.shipping)}</td></tr>
              <tr><td className="lbl indent">Customs (incl. duty)</td><td className="amt">{fmt(costOfSales.customs)}</td></tr>
              <tr><td className="lbl indent">Terminal</td><td className="amt">{fmt(costOfSales.terminal)}</td></tr>
              <tr><td className="lbl indent">Delivery</td><td className="amt">{fmt(costOfSales.delivery)}</td></tr>
              <tr><td className="lbl indent">Operations</td><td className="amt">{fmt(costOfSales.operations)}</td></tr>
              <tr><td className="lbl indent">Extra Charges</td><td className="amt">{fmt(costOfSales.extras)}</td></tr>
              <tr className="subtotal">
                <td className="lbl">Total Cost of Sales</td>
                <td className="amt">{fmt(costOfSales.total)}</td>
              </tr>

              <tr className={`gross ${grossProfit < 0 ? "negative" : ""}`}>
                <td className="lbl">Gross Profit ({fmtPct(grossMarginPct)})</td>
                <td className="amt">{fmt(grossProfit)}</td>
              </tr>

              <tr className="section-header"><td colSpan={2}>Operating Expenses (Overheads)</td></tr>
              {sortedOverheads.length === 0 ? (
                <tr><td className="lbl indent" colSpan={2} style={{ color: "#94a3b8", fontStyle: "italic" }}>No overhead expenses in period.</td></tr>
              ) : sortedOverheads.map(([cat, amt]) => (
                <tr key={cat}><td className="lbl indent">{cat}</td><td className="amt">{fmt(amt)}</td></tr>
              ))}
              <tr className="subtotal">
                <td className="lbl">Total Overheads</td>
                <td className="amt">{fmt(overheads.total)}</td>
              </tr>

              <tr className={`net ${netProfit < 0 ? "negative" : ""}`}>
                <td className="lbl">{overheads.appliedToNet ? `Net Profit (${fmtPct(netMarginPct)})` : `Gross Profit — Client View (overheads excluded)`}</td>
                <td className="amt">{fmt(netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {revenue.byClient.length > 0 && clientId !== undefined && clientId === "all" || (!clientId) ? (
          <div className="section">
            <div className="section-heading">Revenue by Client</div>
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="right">Invoices</th>
                  <th className="right">Revenue (₦)</th>
                  <th className="right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {revenue.byClient.map(c => (
                  <tr key={c.clientId}>
                    <td>{c.clientName}</td>
                    <td className="right">{c.invoiceCount}</td>
                    <td className="right" style={{ color: "#0f766e", fontWeight: 600 }}>{fmt(c.revenue)}</td>
                    <td className="right">{revenue.totalRevenue > 0 ? fmtPct((c.revenue / revenue.totalRevenue) * 100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td className="right">{revenue.invoiceCount}</td>
                  <td className="right" style={{ color: "#0f766e" }}>{fmt(revenue.totalRevenue)}</td>
                  <td className="right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {monthly.length > 1 && (
          <div className="section">
            <div className="section-heading">Monthly Breakdown</div>
            <table className="data">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="right">Containers</th>
                  <th className="right">Revenue (₦)</th>
                  <th className="right">Cost of Sales (₦)</th>
                  <th className="right">Gross Profit (₦)</th>
                  <th className="right">Overheads (₦)</th>
                  <th className="right">Net Profit (₦)</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map(m => (
                  <tr key={m.month}>
                    <td>{fmtMonth(m.month)}</td>
                    <td className="right">{m.containerCount}</td>
                    <td className="right">{fmt(m.revenue)}</td>
                    <td className="right">{fmt(m.costOfSales)}</td>
                    <td className={`right ${m.grossProfit < 0 ? "neg" : "pos"}`}>{fmt(m.grossProfit)}</td>
                    <td className="right">{fmt(m.overheads)}</td>
                    <td className={`right ${m.netProfit < 0 ? "neg" : "pos"}`}>{fmt(m.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer">
          <p>Bonded Terminal Clearing · Profit &amp; Loss Statement · {periodLabel} · {clientLabel}</p>
          <p style={{ marginTop: 4 }}>
            Net Profit: <strong style={{ color: netProfit < 0 ? "#dc2626" : "#059669" }}>{fmt(netProfit)}</strong>
            {" · "}Net Margin: <strong>{fmtPct(netMarginPct)}</strong>
          </p>
          {!overheads.appliedToNet && (
            <p className="note">Overheads are organisation-wide and not subtracted when filtering by a single client. The client view shows gross profit only.</p>
          )}
          <p className="note">Revenue is recognised on invoice issuance using net sales (ex-VAT). Draft invoices are excluded. VAT collected is a tax liability, not revenue.</p>
        </div>
      </div>
    </>
  );
}
