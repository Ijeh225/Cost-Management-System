import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getStatusLabel } from "./format";

export interface ExportRow {
  containerNumber: string;
  blNumber: string;
  customerName: string;
  declaration?: string | null;
  vessel?: string | null;
  size?: string | null;
  status: string;
  clearingCharges?: number | null;
  totalCost?: number | null;
  grossProfit?: number | null;
  paarReleasedAt?: string | null;
  createdAt?: string | null;
}

const fmtNaira = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
};

const buildRows = (containers: ExportRow[]) =>
  containers.map((c) => ({
    "Container #": c.containerNumber,
    "BL #": c.blNumber,
    Customer: c.customerName,
    Declaration: c.declaration || "—",
    Vessel: c.vessel || "—",
    Size: c.size || "—",
    Status: getStatusLabel(c.status),
    PAAR: c.paarReleasedAt ? "Released" : "Pending",
    "Clearing Charges (₦)": fmtNaira(c.clearingCharges),
    "Total Cost (₦)": fmtNaira(c.totalCost),
    "Gross Profit (₦)": fmtNaira(c.grossProfit),
    Created: fmtDate(c.createdAt),
  }));

export function exportContainersToExcel(containers: ExportRow[], filename = "containers") {
  const rows = buildRows(containers);
  const ws = XLSX.utils.json_to_sheet(rows);

  const headers = Object.keys(rows[0] ?? {});
  ws["!cols"] = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String((r as Record<string, unknown>)[h] ?? "").length),
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Containers");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}-${stamp}.xlsx`);
}

export function exportContainersToPdf(containers: ExportRow[], filename = "containers") {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const generated = new Date().toLocaleString("en-GB");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Container Directory Export", 40, 40);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`${containers.length} container${containers.length === 1 ? "" : "s"}  •  Generated ${generated}`, 40, 56);
  doc.setTextColor(0);

  const headers = [
    "Container #",
    "BL #",
    "Customer",
    "Declaration",
    "Vessel / Size",
    "Status",
    "Clearing (NGN)",
    "Total Cost (NGN)",
    "Gross Profit (NGN)",
  ];

  const body = containers.map((c) => [
    c.containerNumber,
    c.blNumber,
    c.customerName,
    c.declaration || "—",
    `${c.vessel || "—"}${c.size ? ` / ${c.size}` : ""}`,
    getStatusLabel(c.status),
    fmtNaira(c.clearingCharges),
    fmtNaira(c.totalCost),
    fmtNaira(c.grossProfit),
  ]);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold" },
      1: { cellWidth: 90 },
      2: { cellWidth: 110 },
      3: { cellWidth: 100 },
      4: { cellWidth: 90 },
      5: { cellWidth: 80 },
      6: { halign: "right", cellWidth: 80 },
      7: { halign: "right", cellWidth: 80 },
      8: { halign: "right", cellWidth: 80 },
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageNum = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Page ${pageNum} of ${pageCount}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" },
      );
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${filename}-${stamp}.pdf`);
}
