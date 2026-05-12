import { useGetCashFlow, type CashFlowTxn } from "@workspace/api-client-react";

const fmt = (n: number) =>
  "\u20a6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

function useQueryParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(search);
  return {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    bankId: p.get("bankId") ?? undefined,
  };
}

const TYPE_LABEL: Record<CashFlowTxn["type"], string> = {
  invoice_payment: "Invoice Payment",
  client_deposit: "Wallet Deposit",
  overhead_expense: "Overhead",
  duty_payment: "Customs Duty",
};

function downloadCsv(rows: CashFlowTxn[], filename: string) {
  const headers = ["Date", "Direction", "Type", "Description", "Category", "Bank", "Reference", "Amount"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      esc(fmtDate(r.date)),
      esc(r.direction === "in" ? "Inflow" : "Outflow"),
      esc(TYPE_LABEL[r.type]),
      esc(r.description),
      esc(r.category ?? ""),
      esc(r.bankName ?? "Unassigned"),
      esc(r.reference ?? ""),
      r.amount.toFixed(2),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function CashFlowPrint() {
  const { from, to, bankId } = useQueryParams();
  const { data, isLoading, isError } = useGetCashFlow({ from, to, bankId });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial, sans-serif", color: "#64748b" }}>
        Generating cash flow report…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontFamily: "Arial, sans-serif" }}>
        Failed to load cash flow report. Please close this tab and try again.
      </div>
    );
  }

  const { period, inflows, outflows, totals, breakdown, banks } = data;

  const periodLabel = (() => {
    if (period.from && period.to) return `${fmtDate(period.from)} \u2013 ${fmtDate(period.to)}`;
    if (period.from) return `From ${fmtDate(period.from)}`;
    if (period.to) return `Up to ${fmtDate(period.to)}`;
    return "All Time";
  })();

  const bankLabel = bankId && bankId !== "all"
    ? (banks.find(b => String(b.id) === String(bankId))?.name ?? `Bank #${bankId}`)
    : "All Banks";

  const allTxns = [...inflows, ...outflows].sort((a, b) => a.date.localeCompare(b.date));
  const csvFilename = `cashflow_${(period.from ?? "all")}_${(period.to ?? "all")}.csv`;

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
        .summary-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }
        .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
        .summary-card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
        .summary-card .val { font-size: 18px; font-weight: 800; font-family: monospace; color: #1e293b; }
        .summary-card.in .val { color: #059669; }
        .summary-card.out .val { color: #dc2626; }
        .summary-card.net .val { color: #0f766e; }
        .summary-card.net.negative .val { color: #dc2626; }
        .summary-card.open .val { color: #1d4ed8; }
        .summary-card.close .val { color: #0f766e; }
        .summary-card.close.negative .val { color: #dc2626; }
        .statement-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px; }
        .stmt-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
        .stmt-row:last-child { border-bottom: none; }
        .stmt-row.heading { font-weight: 700; color: #334155; }
        .stmt-row.sub { padding-left: 24px; font-size: 12px; color: #64748b; }
        .stmt-row.total { font-weight: 800; font-size: 14px; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 4px; }
        .stmt-row .lbl { color: #475569; }
        .stmt-row .val { font-family: monospace; font-weight: 600; }
        .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; }
        thead th.right { text-align: right; }
        tbody td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
        tbody td.right { text-align: right; font-family: monospace; }
        tbody td.mono { font-family: monospace; }
        tbody td.in { color: #059669; font-weight: 600; }
        tbody td.out { color: #dc2626; font-weight: 600; }
        tbody tr:last-child td { border-bottom: none; }
        tfoot td { padding: 10px 10px; border-top: 2px solid #e2e8f0; font-weight: 700; font-size: 13px; }
        tfoot td.right { text-align: right; font-family: monospace; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .breakdown-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
        .breakdown-box h4 { margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #475569; font-weight: 700; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; border-bottom: 1px dashed #e2e8f0; }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-row .lbl { color: #475569; }
        .breakdown-row .val { font-family: monospace; font-weight: 600; color: #1e293b; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .footer .note { margin-top: 6px; font-style: italic; color: #b8b8b8; }
        .action-bar { position: fixed; top: 20px; right: 30px; display: flex; gap: 10px; }
        .btn-print { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-csv { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-back { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
        .empty { text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px; }
      `}</style>

      <div className="action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>← Close</button>
        <button className="btn-csv" onClick={() => downloadCsv(allTxns, csvFilename)}>Download CSV</button>
        <button className="btn-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="page">
        <div className="header">
          <div>
            <div className="company-name">Bonded Terminal Clearing</div>
            <div className="company-sub">Nigerian Port Clearing Services</div>
          </div>
          <div>
            <div className="report-title">Cash Flow Statement</div>
            <div className="report-sub">{periodLabel}</div>
            <div className="report-sub">Bank: {bankLabel}</div>
            <div className="report-sub">Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="summary-cards">
          <div className={`summary-card open ${totals.openingBalance < 0 ? "negative" : ""}`}>
            <div className="lbl">Opening Balance</div>
            <div className="val">{fmt(totals.openingBalance)}</div>
          </div>
          <div className="summary-card in">
            <div className="lbl">Total Inflow</div>
            <div className="val">{fmt(totals.totalIn)}</div>
          </div>
          <div className="summary-card out">
            <div className="lbl">Total Outflow</div>
            <div className="val">{fmt(totals.totalOut)}</div>
          </div>
          <div className={`summary-card net ${totals.netCashFlow < 0 ? "negative" : ""}`}>
            <div className="lbl">Net Movement</div>
            <div className="val">{fmt(totals.netCashFlow)}</div>
          </div>
          <div className={`summary-card close ${totals.closingBalance < 0 ? "negative" : ""}`}>
            <div className="lbl">Closing Balance</div>
            <div className="val">{fmt(totals.closingBalance)}</div>
          </div>
        </div>

        {/* Statement of Cash Flows */}
        <div className="statement-box">
          <div className="stmt-row heading">
            <div className="lbl">Opening Balance (b/f)</div>
            <div className="val" style={{ color: totals.openingBalance < 0 ? "#dc2626" : "#1d4ed8" }}>{fmt(totals.openingBalance)}</div>
          </div>
          <div className="stmt-row heading">
            <div className="lbl">Cash received in period</div>
            <div className="val" style={{ color: "#059669" }}>{fmt(totals.totalIn)}</div>
          </div>
          <div className="stmt-row sub">
            <div className="lbl">Invoice payments received</div>
            <div className="val">{fmt(breakdown.inflowByType.invoice_payment ?? 0)}</div>
          </div>
          <div className="stmt-row sub">
            <div className="lbl">Wallet / client deposits</div>
            <div className="val">{fmt(breakdown.inflowByType.client_deposit ?? 0)}</div>
          </div>
          <div className="stmt-row heading">
            <div className="lbl">Cash paid out in period</div>
            <div className="val" style={{ color: "#dc2626" }}>({fmt(totals.totalOut)})</div>
          </div>
          {Object.entries(breakdown.outflowByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
            <div className="stmt-row sub" key={cat}>
              <div className="lbl">{cat}</div>
              <div className="val">({fmt(amt)})</div>
            </div>
          ))}
          <div className="stmt-row total">
            <div className="lbl" style={{ color: totals.closingBalance < 0 ? "#dc2626" : "#0f766e" }}>Closing Balance (c/f)</div>
            <div className="val" style={{ color: totals.closingBalance < 0 ? "#dc2626" : "#0f766e", fontSize: 15 }}>{fmt(totals.closingBalance)}</div>
          </div>
        </div>

        <div className="section">
          <div className="section-heading">Breakdown</div>
          <div className="grid-2">
            <div className="breakdown-box">
              <h4>Inflow by Source</h4>
              <div className="breakdown-row">
                <div className="lbl">Invoice Payments</div>
                <div className="val" style={{ color: "#059669" }}>{fmt(breakdown.inflowByType.invoice_payment ?? 0)}</div>
              </div>
              <div className="breakdown-row">
                <div className="lbl">Wallet Deposits</div>
                <div className="val" style={{ color: "#059669" }}>{fmt(breakdown.inflowByType.client_deposit ?? 0)}</div>
              </div>
            </div>
            <div className="breakdown-box">
              <h4>Outflow by Category</h4>
              {Object.entries(breakdown.outflowByCategory).length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No outflows in period.</div>
              ) : (
                Object.entries(breakdown.outflowByCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => (
                    <div className="breakdown-row" key={cat}>
                      <div className="lbl">{cat}</div>
                      <div className="val" style={{ color: "#dc2626" }}>{fmt(amt)}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {breakdown.byBank.length > 0 && (
          <div className="section">
            <div className="section-heading">Per-Bank Breakdown</div>
            <table>
              <thead>
                <tr>
                  <th>Bank</th>
                  <th className="right">Inflow (₦)</th>
                  <th className="right">Outflow (₦)</th>
                  <th className="right">Net (₦)</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.byBank.map(b => {
                  const net = b.totalIn - b.totalOut;
                  return (
                    <tr key={`${b.bankId ?? "u"}`}>
                      <td>{b.bankName}</td>
                      <td className="right" style={{ color: "#059669" }}>{fmt(b.totalIn)}</td>
                      <td className="right" style={{ color: "#dc2626" }}>{fmt(b.totalOut)}</td>
                      <td className="right" style={{ color: net < 0 ? "#dc2626" : "#0f766e", fontWeight: 700 }}>{fmt(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td className="right" style={{ color: "#059669" }}>{fmt(totals.totalIn)}</td>
                  <td className="right" style={{ color: "#dc2626" }}>{fmt(totals.totalOut)}</td>
                  <td className="right" style={{ color: totals.netCashFlow < 0 ? "#dc2626" : "#0f766e" }}>{fmt(totals.netCashFlow)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="section">
          <div className="section-heading">Inflows ({inflows.length})</div>
          {inflows.length === 0 ? (
            <div className="empty">No inflows in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Bank</th>
                  <th>Reference</th>
                  <th className="right">Amount (₦)</th>
                </tr>
              </thead>
              <tbody>
                {inflows.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{TYPE_LABEL[t.type]}</td>
                    <td>{t.description}</td>
                    <td>{t.bankName ?? "Unassigned"}</td>
                    <td className="mono">{t.reference ?? "—"}</td>
                    <td className="right in">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ color: "#475569" }}>TOTAL INFLOW</td>
                  <td className="right" style={{ color: "#059669" }}>{fmt(totals.totalIn)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="section">
          <div className="section-heading">Outflows ({outflows.length})</div>
          {outflows.length === 0 ? (
            <div className="empty">No outflows in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Bank</th>
                  <th className="right">Amount (₦)</th>
                </tr>
              </thead>
              <tbody>
                {outflows.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{TYPE_LABEL[t.type]}</td>
                    <td>{t.description}</td>
                    <td>{t.category ?? "—"}</td>
                    <td>{t.bankName ?? "Unassigned"}</td>
                    <td className="right out">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ color: "#475569" }}>TOTAL OUTFLOW</td>
                  <td className="right" style={{ color: "#dc2626" }}>{fmt(totals.totalOut)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="footer">
          <p>Bonded Terminal Clearing · Cash Flow Statement · {periodLabel} · {bankLabel}</p>
          <p style={{ marginTop: 4 }}>Net Cash Position: <strong style={{ color: totals.netCashFlow < 0 ? "#dc2626" : "#0f766e" }}>{fmt(totals.netCashFlow)}</strong></p>
          <p className="note">Note: Customs duty payments are recorded as snapshots; bank attribution is not available for duty entries and they are excluded when filtering by a specific bank.</p>
        </div>
      </div>
    </>
  );
}
