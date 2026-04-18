import { useParams } from "wouter";
import { useGetContainer } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Loader2 } from "lucide-react";

export default function ContainerPrintPage() {
  const { id } = useParams<{ id: string }>();
  const containerId = parseInt(id);
  const { data: container, isLoading } = useGetContainer(containerId);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
    </div>
  );

  if (!container) return <div className="text-center p-10 text-gray-500">Container not found.</div>;

  const c = container as any;
  const charges = c.charges ?? {};

  const extraCharges: Array<{ id: number; section: string; label: string; amount: number; sortOrder: number }> =
    (c.extraCharges ?? []).slice().sort((a: any, b: any) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id
    );

  const extraChargesTotal = extraCharges.reduce((sum, ch) => sum + Number(ch.amount), 0);
  const fixedTotalCost = charges.totalCost ?? 0;
  const totalCost = fixedTotalCost + extraChargesTotal;
  const clearingCharges = charges.clearingCharges ?? parseFloat(c.clearingCharges ?? "0");
  const grossProfit = clearingCharges - totalCost;

  const sectionData = [
    { title: "Shipping Charges",   key: "shipping",   data: charges.shipping   ?? {} },
    { title: "Customs Charges",    key: "customs",    data: charges.customs    ?? {} },
    { title: "Terminal Charges",   key: "terminal",   data: charges.terminal   ?? {} },
    { title: "Delivery Charges",   key: "delivery",   data: charges.delivery   ?? {} },
    { title: "Operations Charges", key: "operations", data: charges.operations ?? {} },
  ];

  const formatKey = (k: string) =>
    k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .page { box-shadow: none !important; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; margin: 0; }
        .page { max-width: 900px; margin: 30px auto; background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 40px; }
        h1 { font-size: 24px; font-weight: 800; color: #1e293b; margin: 0 0 4px 0; }
        .subtitle { font-size: 13px; color: #64748b; }
        .header { border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
        .logo { font-size: 20px; font-weight: 900; color: #6366f1; letter-spacing: -0.5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-card { background: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; }
        .info-card h3 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin: 0 0 10px 0; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .info-label { font-size: 12px; color: #64748b; }
        .info-value { font-size: 12px; font-weight: 600; color: #1e293b; text-align: right; }
        .section-title { font-size: 14px; font-weight: 700; color: #374151; margin: 20px 0 8px 0; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; border-left: 4px solid #6366f1; }
        .charge-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .charge-table tr { border-bottom: 1px solid #e2e8f0; }
        .charge-table tr:last-child { border-bottom: none; }
        .charge-table td { padding: 6px 10px; font-size: 12px; }
        .charge-table td:first-child { color: #64748b; }
        .charge-table td:last-child { font-weight: 600; text-align: right; font-family: monospace; color: #1e293b; }
        .summary-box { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px; color: white; margin: 24px 0; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .summary-item label { font-size: 11px; opacity: 0.8; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-item .amount { font-size: 20px; font-weight: 800; font-family: monospace; }
        .profit-highlight { background: ${grossProfit >= 0 ? '#ecfdf5' : '#fef2f2'}; border: 2px solid ${grossProfit >= 0 ? '#10b981' : '#ef4444'}; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin: 16px 0; }
        .profit-label { font-size: 15px; font-weight: 700; color: ${grossProfit >= 0 ? '#065f46' : '#7f1d1d'}; }
        .profit-amount { font-size: 28px; font-weight: 900; font-family: monospace; color: ${grossProfit >= 0 ? '#059669' : '#dc2626'}; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .print-btn { position: fixed; bottom: 30px; right: 30px; background: #6366f1; color: white; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
        .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #e0e7ff; color: #3730a3; }
      `}</style>
      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="logo">Cost Analysis System</div>
            <p className="subtitle">Container Clearing Cost Report</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>Generated: {new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</p>
            <span className="status-badge" style={{ display: "inline-block", marginTop: "8px" }}>{c.status?.replace(/_/g, " ")}</span>
          </div>
        </div>

        {/* Container Info Grid */}
        <div className="info-grid">
          <div className="info-card">
            <h3>Container Information</h3>
            <div className="info-row"><span className="info-label">Container No.</span><span className="info-value" style={{ fontFamily: "monospace", fontSize: "14px", color: "#6366f1" }}>{c.containerNumber}</span></div>
            <div className="info-row"><span className="info-label">BL Number</span><span className="info-value">{c.blNumber}</span></div>
            <div className="info-row"><span className="info-label">Size</span><span className="info-value">{c.size || "—"}</span></div>
            <div className="info-row"><span className="info-label">Vessel</span><span className="info-value">{c.vessel || "—"}</span></div>
            <div className="info-row"><span className="info-label">Declaration</span><span className="info-value">{c.declaration || "—"}</span></div>
          </div>
          <div className="info-card">
            <h3>Customer Information</h3>
            <div className="info-row"><span className="info-label">Customer Name</span><span className="info-value">{c.customerName}</span></div>
            <div className="info-row"><span className="info-label">Workflow Stage</span><span className="info-value capitalize">{c.status?.replace(/_/g, " ")}</span></div>
            <div className="info-row"><span className="info-label">Date Created</span><span className="info-value">{new Date(c.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</span></div>
          </div>
        </div>

        {/* Financial Summary Box */}
        <div className="summary-box">
          <div className="summary-grid">
            <div className="summary-item">
              <label>Clearing Charges (Revenue)</label>
              <div className="amount">{formatCurrency(clearingCharges)}</div>
            </div>
            <div className="summary-item">
              <label>Total Actual Cost</label>
              <div className="amount">{formatCurrency(totalCost)}</div>
            </div>
            <div className="summary-item">
              <label>Gross Profit / Loss</label>
              <div className="amount" style={{ color: grossProfit >= 0 ? "#6ee7b7" : "#fca5a5" }}>{formatCurrency(grossProfit)}</div>
            </div>
          </div>
        </div>

        {/* Detailed Charges */}
        {sectionData.map(({ title, key, data }) => {
          const entries = Object.entries(data).filter(([k, v]) =>
            !["id","containerId","updatedAt","createdAt"].includes(k) && v !== null && Number(v) !== 0
          );
          const sectionExtras = extraCharges.filter(e => e.section === key);
          if (entries.length === 0 && sectionExtras.length === 0) return null;
          return (
            <div key={title}>
              <div className="section-title">{title}</div>
              <table className="charge-table">
                <tbody>
                  {entries.map(([k, v]) => (
                    <tr key={k}>
                      <td>{formatKey(k)}</td>
                      <td>{formatCurrency(Number(v))}</td>
                    </tr>
                  ))}
                  {sectionExtras.map(e => (
                    <tr key={`extra-${e.id}`} style={{ borderTop: entries.length > 0 ? undefined : "none" }}>
                      <td style={{ color: "#6366f1", fontStyle: "italic" }}>{e.label}</td>
                      <td>{formatCurrency(Number(e.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Approval Status */}
        {c.sectionApprovals?.length > 0 && (
          <div>
            <div className="section-title">Section Approval Status</div>
            <table className="charge-table">
              <tbody>
                {c.sectionApprovals.map((a: any) => (
                  <tr key={a.section}>
                    <td style={{ textTransform: "capitalize" }}>{a.section}</td>
                    <td><span className="badge" style={{ background: a.status === "approved" ? "#d1fae5" : a.status === "rejected" ? "#fee2e2" : "#fef3c7", color: a.status === "approved" ? "#065f46" : a.status === "rejected" ? "#7f1d1d" : "#78350f" }}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Unpaid Duty Alert */}
        {charges.customs?.dutyNotPaid > 0 && (
          <div style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0" }}>
            <span style={{ fontWeight: 700, color: "#92400e", fontSize: "13px" }}>⚠ Outstanding Duty Not Paid</span>
            <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#b45309" }}>{formatCurrency(charges.customs.dutyNotPaid)}</span>
          </div>
        )}

        <div className="footer">
          <p>This is a system-generated report from the Cost Analysis System · Confidential</p>
          <p style={{ marginTop: "4px" }}>{c.containerNumber} · {c.customerName} · {new Date().toLocaleDateString("en-NG")}</p>
        </div>
      </div>

      <button className="print-btn no-print" onClick={() => window.print()}>🖨 Print / Save PDF</button>
    </>
  );
}
