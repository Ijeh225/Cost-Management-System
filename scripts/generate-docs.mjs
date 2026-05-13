import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUTPUT = path.resolve("docs/COST-App-User-Guide.pdf");
fs.mkdirSync("docs", { recursive: true });

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
  info: {
    Title: "COST – Container Clearing Management System: Full User Guide",
    Author: "COST System",
    Subject: "Complete Feature Documentation",
  },
});

const stream = fs.createWriteStream(OUTPUT);
doc.pipe(stream);

// ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
const C = {
  primary:   "#1a56db",
  accent:    "#0e9f6e",
  warning:   "#d97706",
  danger:    "#dc2626",
  dark:      "#111827",
  mid:       "#374151",
  light:     "#6b7280",
  bg:        "#f3f4f6",
  white:     "#ffffff",
  border:    "#e5e7eb",
};

const PW = doc.page.width  - doc.page.margins.left - doc.page.margins.right;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
let tocEntries = [];

function pageNum() { return doc.bufferedPageRange().start + doc.bufferedPageRange().count; }

function addToc(label, level = 1) {
  tocEntries.push({ label, level, page: pageNum() });
}

function hline(y, color = C.border, width = 1) {
  doc.save().moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + PW, y)
     .strokeColor(color).lineWidth(width).stroke().restore();
}

function coverPage() {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.primary);
  doc.rect(0, doc.page.height - 120, doc.page.width, 120).fill("#0f3799");

  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(38)
     .text("COST", doc.page.margins.left, 180, { width: PW, align: "center" });

  doc.fillColor("#93c5fd").font("Helvetica").fontSize(16)
     .text("Container Clearing Management System", doc.page.margins.left, 228, { width: PW, align: "center" });

  doc.moveDown(2);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(26)
     .text("Complete User Guide", doc.page.margins.left, 290, { width: PW, align: "center" });

  doc.fillColor("#bfdbfe").font("Helvetica").fontSize(13)
     .text("Nigerian Bonded Terminal Container Clearing ERP", doc.page.margins.left, 330, { width: PW, align: "center" });

  doc.fillColor("#93c5fd").fontSize(11)
     .text("All Features · Step-by-Step Instructions · Real-World Examples", doc.page.margins.left, 355, { width: PW, align: "center" });

  // box
  const bx = doc.page.margins.left + PW * 0.1;
  const bw = PW * 0.8;
  doc.roundedRect(bx, 420, bw, 160, 10).fillAndStroke("#0f3799", "#3b82f6");
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(13)
     .text("WHAT THIS GUIDE COVERS", bx, 438, { width: bw, align: "center" });
  doc.font("Helvetica").fontSize(11).fillColor("#bfdbfe")
     .text(
       "✓  Container lifecycle from registration to closed\n" +
       "✓  All 5 charge sections with field-by-field explanations\n" +
       "✓  Duty payments, container payments & bank management\n" +
       "✓  Invoicing, accounts receivable & financial reports\n" +
       "✓  User roles, approvals, notifications & settings",
       bx + 20, 462, { width: bw - 40, lineGap: 4 }
     );

  doc.fillColor("#93c5fd").font("Helvetica").fontSize(10)
     .text("Version 1.0 Enterprise  ·  May 2026", doc.page.margins.left, doc.page.height - 90, { width: PW, align: "center" });
  doc.fillColor(C.white).fontSize(10)
     .text("Confidential — For Internal Use Only", doc.page.margins.left, doc.page.height - 72, { width: PW, align: "center" });
}

function newChapter(num, title) {
  doc.addPage();
  addToc(`${num}. ${title}`, 1);
  doc.rect(0, 0, doc.page.width, 90).fill(C.primary);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(11)
     .text(`CHAPTER ${num}`, doc.page.margins.left, 28, { width: PW });
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(22)
     .text(title, doc.page.margins.left, 48, { width: PW });
  doc.y = 110;
}

function section(title) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
  addToc(`   ${title}`, 2);
  doc.moveDown(0.8);
  doc.fillColor(C.primary).font("Helvetica-Bold").fontSize(14).text(title);
  hline(doc.y + 2, C.primary, 1.5);
  doc.moveDown(0.5);
  doc.fillColor(C.dark).font("Helvetica").fontSize(11);
}

function sub(title) {
  doc.moveDown(0.5);
  doc.fillColor(C.mid).font("Helvetica-Bold").fontSize(12).text(title);
  doc.fillColor(C.dark).font("Helvetica").fontSize(11);
  doc.moveDown(0.2);
}

function body(text, opts = {}) {
  doc.fillColor(C.dark).font("Helvetica").fontSize(11)
     .text(text, { lineGap: 3, ...opts });
  doc.moveDown(0.4);
}

function bullet(items, indent = 0) {
  for (const item of items) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) doc.addPage();
    doc.fillColor(C.dark).font("Helvetica").fontSize(11)
       .text(`• ${item}`, { indent: 12 + indent, lineGap: 3 });
  }
  doc.moveDown(0.4);
}

function numbered(items) {
  items.forEach((item, i) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) doc.addPage();
    doc.fillColor(C.dark).font("Helvetica").fontSize(11)
       .text(`${i + 1}.  ${item}`, { indent: 12, lineGap: 3 });
  });
  doc.moveDown(0.4);
}

function example(title, text) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
  const ey = doc.y;
  doc.rect(doc.page.margins.left, ey, PW, 14).fill("#eff6ff");
  doc.fillColor(C.primary).font("Helvetica-Bold").fontSize(10)
     .text(`  EXAMPLE: ${title}`, doc.page.margins.left + 4, ey + 2, { width: PW - 8 });
  doc.y = ey + 16;
  const ty = doc.y;
  doc.fillColor(C.mid).font("Helvetica").fontSize(10.5)
     .text(text, doc.page.margins.left + 12, ty, { width: PW - 24, lineGap: 3 });
  const by = doc.y + 6;
  doc.rect(doc.page.margins.left, ey, PW, by - ey).stroke(C.primary);
  doc.y = by + 8;
  doc.moveDown(0.3);
}

function tip(text) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  const ty = doc.y;
  doc.rect(doc.page.margins.left, ty, PW, 12).fill("#f0fdf4");
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(10)
     .text("  ✓ TIP", doc.page.margins.left + 4, ty + 1, { width: PW - 8 });
  doc.y = ty + 14;
  doc.fillColor(C.mid).font("Helvetica").fontSize(10.5)
     .text(text, doc.page.margins.left + 12, doc.y, { width: PW - 24, lineGap: 3 });
  doc.y += 8;
  doc.moveDown(0.3);
}

function warn(text) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  const ty = doc.y;
  doc.rect(doc.page.margins.left, ty, PW, 12).fill("#fffbeb");
  doc.fillColor(C.warning).font("Helvetica-Bold").fontSize(10)
     .text("  ⚠ NOTE", doc.page.margins.left + 4, ty + 1, { width: PW - 8 });
  doc.y = ty + 14;
  doc.fillColor(C.mid).font("Helvetica").fontSize(10.5)
     .text(text, doc.page.margins.left + 12, doc.y, { width: PW - 24, lineGap: 3 });
  doc.y += 8;
  doc.moveDown(0.3);
}

function tableHeader(cols, widths) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  const y = doc.y;
  doc.rect(doc.page.margins.left, y, PW, 18).fill(C.primary);
  let x = doc.page.margins.left + 4;
  cols.forEach((c, i) => {
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(10)
       .text(c, x, y + 4, { width: widths[i] - 8, lineBreak: false });
    x += widths[i];
  });
  doc.y = y + 18;
}

function tableRow(cols, widths, shade) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 30) doc.addPage();
  const y = doc.y;
  doc.rect(doc.page.margins.left, y, PW, 16).fill(shade ? C.bg : C.white);
  let x = doc.page.margins.left + 4;
  cols.forEach((c, i) => {
    doc.fillColor(C.dark).font("Helvetica").fontSize(10)
       .text(String(c), x, y + 3, { width: widths[i] - 8, lineBreak: false });
    x += widths[i];
  });
  doc.rect(doc.page.margins.left, y, PW, 16).stroke(C.border);
  doc.y = y + 16;
}

// ═════════════════════════════════════════════════════════════════════════════
//  BUILD THE DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════

// ── COVER ────────────────────────────────────────────────────────────────────
coverPage();

// ── CHAPTER 1: INTRODUCTION ──────────────────────────────────────────────────
newChapter(1, "Introduction to the COST System");

section("What Is the COST System?");
body(
  "COST (Container Clearing Management System) is a comprehensive, web-based Enterprise Resource Planning " +
  "(ERP) application purpose-built for Nigerian bonded terminal container clearing operations. " +
  "It manages the full lifecycle of every container job — from the moment a vessel arrives at berth " +
  "all the way through customs clearance, terminal operations, delivery, and final invoicing."
);
body(
  "The system is designed to give every team — documentation, accounts, terminal operations, " +
  "gate security, and management — a single source of truth for all container-related activities, " +
  "financial charges, and disbursements."
);

section("Key Benefits");
bullet([
  "Eliminates manual spreadsheets and paper records",
  "Real-time visibility of every container's status and financial position",
  "Automated cost tracking across all five charge sections",
  "Role-based access ensures staff only see what they need",
  "Full audit trail of every change made by every user",
  "Exportable reports for management, clients, and regulatory compliance",
]);

section("How to Access the System");
numbered([
  "Open your web browser (Chrome or Edge recommended).",
  "Navigate to your company's COST system URL (e.g. https://your-company.replit.app).",
  "Enter your Username and Password on the login screen.",
  "Click Sign In. You will be taken to your Dashboard.",
]);
example(
  "Logging In",
  "Username: accounts@company.com  |  Password: ••••••••\n" +
  "After login, the system automatically redirects you to the Dashboard showing today's active containers, " +
  "pending tasks, and alerts relevant to your role."
);
tip("Bookmark the URL so you can access it quickly every day.");

// ── CHAPTER 2: USER ROLES ────────────────────────────────────────────────────
newChapter(2, "User Roles & Permissions");

section("Overview");
body(
  "COST uses a role-based access control system. Each user is assigned one or more roles that determine " +
  "which pages they can visit and which actions they can perform. This prevents unauthorised changes and " +
  "protects financial data."
);

section("Role Descriptions");

const roleW = [110, 160, PW - 270];
tableHeader(["Role", "Who Uses It", "What They Can Do"], roleW);
const roles = [
  ["Super Admin", "MD / IT Manager", "Full system access including all settings, user management, and all financial data."],
  ["Admin", "Operations Manager", "Full operational access. Can approve/reject sections, lock containers, view all reports."],
  ["Accounts / AR", "Accounts Team", "Duty payments, container payments, invoices, accounts receivable, bank management."],
  ["Documentation", "Documentation Staff", "Enter charges for assigned sections (Shipping, Customs, etc.). Submit for approval."],
  ["Operations", "Terminal / Delivery Staff", "Transire processing, shipping, terminal, pull-out stages and related tasks."],
  ["Transire", "Transire Team", "Transire processing stage and related documents only."],
  ["Security", "Gate Officers", "Gate-in and gate-out recording only."],
];
roles.forEach((r, i) => tableRow(r, roleW, i % 2 === 0));

doc.moveDown(0.5);

section("Section-Level Permissions");
body(
  "Beyond the role, an Admin can restrict a Documentation user to only specific charge sections. " +
  "For example, a Shipping Officer may only be allowed to edit the Shipping section, while a Customs Officer " +
  "can only edit the Customs section. This is configured in Settings → User Management."
);
example(
  "Section Permission Setup",
  "User: Emeka Okonkwo  |  Role: Documentation\n" +
  "Section Permissions: Shipping, Customs  (Terminal, Delivery, Operations are locked for this user)\n\n" +
  "When Emeka opens any container, he can only edit and submit the Shipping and Customs charge sections. " +
  "All other sections appear in read-only mode."
);

// ── CHAPTER 3: DASHBOARD ─────────────────────────────────────────────────────
newChapter(3, "Dashboard & Analytics");

section("The Dashboard");
body(
  "The Dashboard is the first thing you see after logging in. It gives a real-time snapshot of the " +
  "entire operation. It is refreshed automatically and shows data relevant to your role."
);

sub("Summary Cards");
bullet([
  "Active Containers — total number of jobs currently in progress",
  "Awaiting Duty Payment — containers stuck at the duty payment stage",
  "Pending Approval — charge sections submitted by staff waiting for admin review",
  "Outstanding AR — total invoiced amount not yet collected from clients",
]);

sub("Charts & Analytics");
bullet([
  "Containers by Stage — bar chart showing how many containers are at each pipeline stage",
  "Monthly Throughput — line chart of containers completed per month",
  "Profit by Customer — which clients generate the most gross profit",
  "Profit by Vessel — profitability broken down by vessel/voyage",
  "Staff Productivity — tasks completed and sections submitted by each team member",
]);

sub("Aging Alerts");
body(
  "Containers are colour-coded based on how many days they have been in the system without moving:"
);
bullet([
  "Green — active and moving normally",
  "Amber — moderate delay (caution)",
  "Orange — significant delay (action required)",
  "Red — critical delay (escalation needed)",
]);

tip("Click any summary card to jump directly to the filtered container list showing those jobs.");

// ── CHAPTER 4: CONTAINER MANAGEMENT ──────────────────────────────────────────
newChapter(4, "Container Management — The Core Module");

section("What Is a Container Record?");
body(
  "Every clearing job in COST is represented as a Container record. It holds all information about " +
  "that job: the vessel, B/L number, customer, all charges, documents, payments, tasks, and its " +
  "current position in the clearing pipeline."
);

section("Creating a New Container (Job)");
numbered([
  "From the sidebar, click Containers.",
  "Click the + New Container button (top right).",
  "Fill in the required fields and click Save.",
]);

sub("Required Fields");
const fieldW = [160, PW - 160];
tableHeader(["Field", "Description"], fieldW);
const fields = [
  ["Container Number", "The physical container number (e.g. MSCU1234567)"],
  ["B/L Number", "Bill of Lading reference number from the shipping company"],
  ["Customer Name", "The importer / consignee this job is for"],
  ["Vessel / Voyage", "Name of the ship and voyage number"],
  ["Berthing Date", "Date the vessel arrived at the port"],
  ["Clearing Charges (₦)", "Your company's agreed fee to clear this container for the client"],
];
fields.forEach((f, i) => tableRow(f, fieldW, i % 2 === 0));
doc.moveDown(0.5);

example(
  "Creating a Container Record",
  "Container Number: TCKU3456789\n" +
  "B/L Number: MSCUNG123456\n" +
  "Customer: Dangote Industries Ltd\n" +
  "Vessel: MSC ANNA / Voyage 042W\n" +
  "Berthing Date: 10 May 2026\n" +
  "Clearing Charges: ₦850,000.00\n\n" +
  "Click Save. The container is now registered and appears on the pipeline at the 'Registered' stage."
);

section("Searching & Filtering Containers");
body("Use the Search bar at the top of the Containers page to find a job by:");
bullet([
  "Container Number (full or partial)",
  "B/L Number",
  "Customer Name",
]);
body("Use the filter dropdowns to narrow results by:");
bullet([
  "Pipeline Stage (e.g. show only 'Duty Payment' containers)",
  "Client",
  "Berthing Date range",
]);

section("The Container Detail Page");
body(
  "Clicking on any container opens its full detail page. This page has multiple tabs:"
);
bullet([
  "Charges — the five cost sections and extra charges",
  "Documents — uploaded files (B/L, invoices, permits)",
  "Tasks — operational tasks assigned to this container",
  "Timeline — full history of every status change and edit",
  "Audit Log — every field change with before/after values",
]);

// ── CHAPTER 5: PIPELINE STAGES ───────────────────────────────────────────────
newChapter(5, "The Container Pipeline — Stage by Stage");

section("Overview");
body(
  "Every container moves through a defined sequence of stages from registration to final closure. " +
  "The pipeline ensures no step is skipped and the right team handles each stage."
);

const stageW = [20, 130, 110, PW - 260];
tableHeader(["#", "Stage", "Responsible Team", "What Happens"], stageW);
const stages = [
  ["1", "Registered", "Admin / Documentation", "Container created in system. Basic details recorded."],
  ["2", "Documentation", "Documentation Staff", "Charge sections filled in: Shipping, Customs, Terminal, Delivery, Operations."],
  ["3", "Duty Assessment", "Documentation / Customs", "Customs duty amount assessed and entered in the Customs section."],
  ["4", "Duty Payment", "Accounts Team", "Accounts records payment of customs duty. Container advances automatically."],
  ["5", "Transire Processing", "Transire Team", "Transire documents processed and released."],
  ["6", "Shipping / Terminal", "Operations Team", "Container handed over to terminal for physical release."],
  ["7", "Pull Out", "Operations Team", "Container physically pulled out of the terminal yard."],
  ["8", "Delivery", "Operations / Logistics", "Container delivered to customer's warehouse or factory."],
  ["9", "Closed", "Admin", "Job completed. Final invoice issued. Container archived."],
];
stages.forEach((s, i) => tableRow(s, stageW, i % 2 === 0));
doc.moveDown(0.5);

section("Advancing a Container's Stage");
numbered([
  "Open the container detail page.",
  "Scroll to the top — the current stage is shown in the status badge.",
  "Click Advance Stage (or the stage-specific action button).",
  "Confirm the action in the popup dialog.",
]);
warn(
  "Only authorised users can advance a container from certain stages. For example, only an Accounts user " +
  "can advance a container out of the 'Duty Payment' stage. If you do not see the Advance button, " +
  "contact your system admin."
);

section("The Pipeline Board (Kanban View)");
body(
  "The Pipeline Board shows all active containers as cards grouped by their current stage — like a " +
  "Kanban board. This gives management instant visibility of how many jobs are at each step."
);
tip("Use the Pipeline Board daily for your morning briefing to see exactly where every job stands.");

// ── CHAPTER 6: CHARGE SECTIONS ───────────────────────────────────────────────
newChapter(6, "The Five Charge Sections");

section("Overview");
body(
  "Each container has five built-in charge sections. These represent every category of cost involved " +
  "in clearing a container. All amounts are in Nigerian Naira (₦). Your documentation staff fill " +
  "these in as costs are incurred and confirmed."
);
warn(
  "Once a section is approved by an Admin, it is locked. No further edits can be made by staff " +
  "unless an Admin unlocks it."
);

// ── SHIPPING ──
section("Section 1: Shipping");
body("This section captures all costs related to the shipping company (freight line).");
const shW = [170, PW - 170];
tableHeader(["Field", "What It Means"], shW);
const shFields = [
  ["Shipping Company (₦)", "The freight charge billed by the shipping line (e.g. MSC, Maersk). Often the largest single cost."],
  ["Shipping Payment VAT (₦)", "VAT charged by the shipping company on their freight invoice."],
  ["Consignee (₦)", "Fees charged by the shipping agent on behalf of the consignee."],
  ["Final Invoice – Shipping Co. (₦)", "The final reconciled invoice amount from the shipping company after adjustments."],
  ["Telex Charge (₦)", "Fee for Telex Release of original Bill of Lading (avoids sending physical documents)."],
  ["Shipping Runnings (₦)", "Miscellaneous running costs incurred at the shipping company's office."],
  ["Detention (To be paid by Customer) (₦)", "Container detention charges that will be recharged directly to the client."],
];
shFields.forEach((f, i) => tableRow(f, shW, i % 2 === 0));
doc.moveDown(0.5);
example(
  "Filling in Shipping Charges",
  "Shipping Company: ₦4,800,000 (MSC freight invoice for 40ft container)\n" +
  "Shipping Payment VAT (7.5%): ₦360,000\n" +
  "Telex Charge: ₦45,000 (B/L released electronically)\n" +
  "Shipping Runnings: ₦12,000\n\n" +
  "TOTAL SHIPPING: ₦5,217,000"
);

// ── CUSTOMS ──
section("Section 2: Customs");
body("This section covers all government and customs-related charges.");
tableHeader(["Field", "What It Means"], shW);
const cuFields = [
  ["Duty / Assessment (₦)", "The core customs import duty assessed by the Nigeria Customs Service based on the CIF value. This figure drives the Duty Payments module."],
  ["Valuation (₦)", "Additional valuation fee charged by customs on imported goods."],
  ["CIU (₦)", "Customs Intelligence Unit charge."],
  ["Up Country Custom (₦)", "Additional customs charge for inland destination deliveries."],
  ["DCIU (₦)", "Destination CIU charge applied at certain ports."],
  ["MD Releasing Package (₦)", "Package fee for MD-level release authorisation."],
  ["OC Settlement (₦)", "Office of Comptroller settlement charge."],
  ["OC Release Local (₦)", "Local release charge payable at the comptroller's office."],
  ["DC Enforcement / Transire (₦)", "Enforcement fee for Transire document processing."],
  ["Compliance Team (₦)", "Fees paid to the NCS compliance team."],
  ["CAC Settlement (₦)", "Corporate Affairs Commission-related settlement."],
  ["CRFFN (₦)", "Council for the Regulation of Freight Forwarding in Nigeria levy."],
  ["SONCAP (₦)", "Standards Organisation of Nigeria Conformity Assessment Programme fee."],
  ["Alerts (₦)", "NCS alert/examination fee when goods are selected for physical examination."],
  ["Examination Bonus (₦)", "Bonus paid to customs examiners during physical container examination."],
];
cuFields.forEach((f, i) => tableRow(f, shW, i % 2 === 0));
doc.moveDown(0.5);
example(
  "Customs Charges for a 40ft Container of Electronics",
  "Duty (Assessment): ₦12,600,000\n" +
  "Valuation: ₦180,000\n" +
  "CIU: ₦85,000\n" +
  "CRFFN: ₦40,000\n" +
  "SONCAP: ₦120,000\n" +
  "Examination Bonus: ₦50,000\n\n" +
  "TOTAL CUSTOMS: ₦13,075,000"
);
warn("The 'Duty / Assessment' field is the figure the Duty Payments page tracks. " +
     "Ensure it is entered correctly before moving the container to the Duty Payment stage.");

// ── TERMINAL ──
section("Section 3: Terminal");
body("All charges levied by the bonded terminal and port authority.");
tableHeader(["Field", "What It Means"], shW);
const tFields = [
  ["Terminal Charges (₦)", "The base charge for the container to sit in the bonded terminal."],
  ["Terminal Additions 1 (₦)", "First set of additional terminal surcharges (e.g. examination fees)."],
  ["Ikorodu Terminal Additions (₦)", "Additional charges specific to Ikorodu terminal operations."],
  ["Terminal Demurrage (Customer) (₦)", "Demurrage fees at the terminal that will be recharged to the client."],
  ["Terminal Payment VAT (₦)", "VAT on terminal charge payments."],
  ["Wharfage / NPA (₦)", "Nigerian Ports Authority wharfage fee based on cargo volume."],
  ["Sifax / GMT Signing (₦)", "Terminal operator signing and documentation fee."],
  ["TS DC Admin (₦)", "Terminal service delivery centre administrative charge."],
  ["Tincan Bond (₦)", "Bond fee for Tincan Island Port operations."],
  ["Bond (₦)", "General bond charge for bonded terminal operations."],
  ["Manifest (₦)", "Cargo manifest processing and amendment fees."],
];
tFields.forEach((f, i) => tableRow(f, shW, i % 2 === 0));
doc.moveDown(0.5);

// ── DELIVERY ──
section("Section 4: Delivery");
body("Haulage and logistics costs to get the container from terminal to the customer's location.");
tableHeader(["Field", "What It Means"], shW);
const dFields = [
  ["Passing of Truck (₦)", "Charge for the truck to enter and pass through checkpoints."],
  ["Passing of Truck – Empty Return (₦)", "Checkpoint charges for the truck returning empty after delivery."],
  ["Parking for Pullout (₦)", "Parking fee at the terminal yard before pulling out."],
  ["Pullout (₦)", "Fee to physically pull the container out of the terminal stack."],
  ["Delivery (₦)", "The main haulage/delivery charge from terminal to the client's warehouse."],
  ["Empty Return (₦)", "Cost of returning the empty container to the shipping line's depot."],
  ["Unchaining Truck (₦)", "Fee for securing/releasing container chains on the truck."],
  ["Empty Call Up (₦)", "Call-up fee for the empty container return."],
  ["Pullout Expenses (₦)", "Miscellaneous expenses incurred during the pullout process."],
  ["Transfer to Ikorodu (₦)", "Cost of transferring container to the Ikorodu depot or location."],
  ["Transport Allowance (₦)", "Driver and crew transport allowance."],
];
dFields.forEach((f, i) => tableRow(f, shW, i % 2 === 0));
doc.moveDown(0.5);
example(
  "Delivery Charges for Inland Delivery",
  "Pullout: ₦85,000\n" +
  "Delivery (Lagos to Sagamu): ₦320,000\n" +
  "Empty Return: ₦95,000\n" +
  "Passing of Truck (× 2): ₦30,000\n" +
  "Transport Allowance: ₦25,000\n\n" +
  "TOTAL DELIVERY: ₦555,000"
);

// ── OPERATIONS ──
section("Section 5: Operations");
body("Internal operational and agency costs to process and release the container.");
tableHeader(["Field", "What It Means"], shW);
const oFields = [
  ["FOU Booking (₦)", "Freight Operations Unit booking fee."],
  ["FOU (₦)", "Freight Operations Unit main processing charge."],
  ["Scanning to Physical (₦)", "Fee for escalation from scanning to physical examination."],
  ["Security (₦)", "Security escort or supervision fee at the terminal."],
  ["Additional Delivery Expenses (₦)", "Any extra delivery-related costs not captured elsewhere."],
  ["Miscellaneous (₦)", "Catch-all for small incidental expenses."],
  ["Abandoned (₦)", "Costs for handling a previously abandoned container."],
  ["Agencies Blocks (₦)", "Fees paid to port agencies for lifting holds or blocks on the container."],
  ["Call Up (₦)", "Call-up processing fee for gate access."],
  ["Transire Runnings (₦)", "Running expenses at the transire office."],
  ["Office PTML (₦)", "Office and PTML (Port Terminal Multipurpose Limited) charges."],
  ["Fresh Payment (₦)", "New or repeat payment made to resolve a specific blockage."],
];
oFields.forEach((f, i) => tableRow(f, shW, i % 2 === 0));

// ── CHAPTER 7: EXTRA CHARGES & CUSTOM FIELDS ─────────────────────────────────
newChapter(7, "Extra Charges & Custom Fields");

section("Extra Charges (Ad-hoc Line Items)");
body(
  "Each of the five charge sections supports unlimited extra charge line items. These are for costs " +
  "that don't fit any of the standard fields — one-off expenses, special agency fees, or client-specific charges."
);
numbered([
  "Open the container and expand the relevant charge section.",
  "Scroll to the bottom of the section and click + Add Extra Charge.",
  "Enter a Label (description), Amount (₦), and click Save.",
  "The extra charge is immediately added to the section total.",
]);
example(
  "Adding a One-Off Extra Charge",
  "Section: Customs\n" +
  "Label: NCS VIN Verification Fee\n" +
  "Amount: ₦35,000\n\n" +
  "This charge appears as a separate line in the Customs section total and is included in all reports and exports."
);

section("Custom Sections & Fields (Admin Only)");
body(
  "Administrators can create entirely new charge sections and custom fields beyond the five standard ones. " +
  "This is useful for company-specific charges or client-specific tracking requirements."
);
numbered([
  "Go to Settings → Custom Fields.",
  "Select which section to add the field to, or create a new section.",
  "Choose the field type: Number, Text, Date, Dropdown, or Checkbox.",
  "Enter the field label and any default value.",
  "Click Save. The field now appears on every container's charge form.",
]);

section("USD / Foreign Currency Charges");
body(
  "Some charges — particularly shipping freight — may be quoted in US Dollars. " +
  "The system allows you to record the USD amount and exchange rate for any section. " +
  "The system automatically converts to Naira and writes the NGN equivalent to the designated field."
);
numbered([
  "In any charge section, scroll down to the USD Entry panel.",
  "Enter the USD Amount (e.g. $3,500).",
  "Enter the Exchange Rate (e.g. ₦1,620 per $1).",
  "The system calculates: ₦3,500 × 1,620 = ₦5,670,000 and fills it into the Shipping Company field.",
  "Click Save Section to record both the NGN charge and the FX metadata.",
]);
example(
  "Recording a USD Freight Charge",
  "USD Amount: $3,500\n" +
  "Exchange Rate: ₦1,620 / $1\n" +
  "Computed NGN: ₦5,670,000 (auto-filled into Shipping Company field)\n\n" +
  "The FX record (USD amount + rate) is saved for audit and FX History reporting."
);

// ── CHAPTER 8: DUTY PAYMENTS ─────────────────────────────────────────────────
newChapter(8, "Duty Payments");

section("What Is the Duty Payments Module?");
body(
  "The Duty Payments module is the accounts team's dedicated tool for tracking and recording " +
  "the payment of customs import duty for every container. It is separate from the container charges " +
  "because duty payment is a critical bottleneck — a container cannot move forward in the pipeline " +
  "until duty has been paid."
);

section("How Duty Appears on This Page");
bullet([
  "A container must first have the Duty / Assessment field filled in the Customs charge section.",
  "When the container reaches the Duty Payment stage, it automatically appears on this page.",
  "The page shows: Duty Assessed, Amount Paid, Amount Outstanding, and Payment Status.",
]);

section("Duty Payment Statuses");
const statW = [100, PW - 100];
tableHeader(["Status", "Meaning"], statW);
const stats = [
  ["Not Assessed", "No duty amount has been entered in the Customs section yet."],
  ["Unpaid", "Duty has been assessed but ₦0 has been paid so far."],
  ["Partial", "Some payment has been made but the full duty is not yet settled."],
  ["Paid", "The full duty amount has been paid. Container can advance."],
];
stats.forEach((s, i) => tableRow(s, statW, i % 2 === 0));
doc.moveDown(0.5);

section("Recording a Duty Payment");
numbered([
  "Go to Duty Payments from the sidebar.",
  "Find the container using the search or filter by status.",
  "Click Record Payment next to the container.",
  "Enter: Amount Paid, Payment Date, and Notes (e.g. bank teller number or reference).",
  "Click Save Payment.",
  "The system updates the Paid and Outstanding balances instantly.",
  "If the container is at the Duty Payment stage, it automatically advances to the next stage.",
]);
example(
  "Paying Duty in Two Instalments",
  "Container: TCKU3456789  |  Duty Assessed: ₦12,600,000\n\n" +
  "Payment 1 (12 May 2026): ₦7,000,000  →  Outstanding: ₦5,600,000  (Status: Partial)\n" +
  "Payment 2 (15 May 2026): ₦5,600,000  →  Outstanding: ₦0           (Status: Paid)\n\n" +
  "After Payment 2, the container automatically advances to Transire Processing."
);
tip(
  "You can also record duty payments from the Container Payments page (Customs section disbursement). " +
  "Both pages stay in sync automatically."
);

section("Duty Payments Reports & Export");
bullet([
  "Summary cards at the top show Total Assessed, Total Paid, Total Outstanding across all containers.",
  "Filter by date range, customer, or status (Paid / Partial / Unpaid).",
  "Export the full ledger to Excel (.xlsx) or PDF for bank reconciliation or audit.",
]);

// ── CHAPTER 9: CONTAINER PAYMENTS ────────────────────────────────────────────
newChapter(9, "Container Payments (Disbursements)");

section("What Is the Container Payments Page?");
body(
  "The Container Payments page is where your accounts team logs every naira paid OUT to vendors, " +
  "agencies, shipping lines, and government bodies on behalf of a container job. " +
  "This is your expense disbursement ledger — the complete record of money leaving the company for each job."
);

section("How to Log a Disbursement");
numbered([
  "Go to Container Payments from the sidebar.",
  "Search for the container by number or B/L number.",
  "Click on the container to open its payment workspace.",
  "You will see all five charge sections. Each shows: Charged (budgeted), Paid (disbursed), Outstanding.",
  "Click Log Disbursement on the section you want to pay.",
  "Enter: Amount, Payment Date, Payment Method (Bank or Cash), Bank Account (if bank), Reference, and Narration.",
  "Click Save Disbursement.",
]);
example(
  "Logging a Terminal Payment",
  "Container: MSCU9876543\n" +
  "Section: Terminal\n" +
  "Amount: ₦680,000\n" +
  "Payment Method: Bank\n" +
  "Bank Account: Zenith Bank – 1234567890\n" +
  "Reference: TRF/2026/051345\n" +
  "Narration: PTML Terminal Charges Payment\n\n" +
  "The Terminal section now shows: Charged ₦680,000 | Paid ₦680,000 | Outstanding ₦0 (SETTLED)"
);

section("Section Payment Statuses");
tableHeader(["Status Badge", "Meaning"], statW);
const payStats = [
  ["SETTLED", "Full amount has been disbursed. Nothing outstanding."],
  ["DUE ₦X,XXX", "Shows the outstanding amount still to be paid to this vendor/agency."],
  ["PARTIAL", "Some payment made but balance remains."],
  ["NOT STARTED", "No disbursement recorded yet for this section."],
];
payStats.forEach((s, i) => tableRow(s, statW, i % 2 === 0));
doc.moveDown(0.5);

section("Budget vs Actual Reconciliation");
body(
  "At the bottom of each container's payment workspace is a Reconciliation panel. This shows:"
);
bullet([
  "Budgeted — the total charges entered in the charge sections",
  "Disbursed — total money actually paid out",
  "Variance — the difference (over or under spend)",
]);
tip(
  "A positive variance (over-spend) may indicate unexpected charges. " +
  "A negative variance means money was budgeted but not yet paid — check if payments are pending."
);

section("Customs Disbursement & Duty Sync");
body(
  "When you log a payment against the Customs section on the Container Payments page, " +
  "the system automatically updates the Duty Payments ledger as well. " +
  "Both pages always show the same duty paid figure for each container."
);

// ── CHAPTER 10: BANK MANAGEMENT ──────────────────────────────────────────────
newChapter(10, "Bank Management");

section("Overview");
body(
  "The Bank Management module tracks your company's bank accounts, fund movements, " +
  "and real-time balances. Every payment recorded in the system is linked to a bank account, " +
  "automatically keeping your bank balances up to date."
);

section("Setting Up Bank Accounts");
numbered([
  "Go to Bank Management from the sidebar.",
  "Click + Add Bank Account.",
  "Enter: Bank Name, Account Number, Account Name, Account Code.",
  "Click Save.",
]);
example(
  "Adding a Bank Account",
  "Bank Name: Zenith Bank\n" +
  "Account Number: 1012345678\n" +
  "Account Name: ABC Clearing Company Ltd\n" +
  "Account Code: ZEN-01\n\n" +
  "This account is now available for selection when recording any payment."
);

section("Recording Fund Additions");
body(
  "When your company receives money into a bank account (from a client, or any source), " +
  "record it as a Fund Addition to keep the balance accurate."
);
numbered([
  "In Bank Management, click the bank account you want to credit.",
  "Click + Add Funds.",
  "Enter: Amount, Date, Source (e.g. 'Client payment – Dangote'), Reference.",
  "Click Save. The bank balance increases by the amount entered.",
]);

section("Internal Bank Transfers");
body("To move funds between your company's own accounts:");
numbered([
  "Click Transfer Funds.",
  "Select the Source Account and Destination Account.",
  "Enter Amount, Date, and Reference.",
  "Click Save. Both accounts update automatically.",
]);

section("Viewing Bank Statement");
body(
  "Each bank account has a full statement showing every transaction in date order: " +
  "funds added, container payments made, overhead expenses paid, and internal transfers. " +
  "The running balance is shown after each transaction."
);
tip("Export the bank statement to Excel for easy reconciliation with your physical bank statement.");

// ── CHAPTER 11: CLIENTS & AR ─────────────────────────────────────────────────
newChapter(11, "Clients & Accounts Receivable");

section("Client Management");
body("All customers your company clears containers for are stored as Client records.");
numbered([
  "Go to Settings → Clients (or Accounts Receivable → Clients).",
  "Click + New Client.",
  "Enter: Company Name, Contact Name, Email, Phone, Address.",
  "Set the Agreed Clearing Rate (₦) — the standard fee agreed with this client.",
  "Click Save.",
]);

section("Accounts Receivable (AR) Overview");
body(
  "The AR module shows you exactly what each client owes you — the full debtors' ledger. " +
  "It helps you manage collections and follow up on overdue invoices."
);

sub("AR Aging Buckets");
body("Outstanding invoices are grouped by how many days they have been overdue:");
bullet([
  "Current — invoice not yet due",
  "1–30 Days — overdue by up to 30 days",
  "31–60 Days — overdue 31 to 60 days (follow-up required)",
  "61–90 Days — overdue 61 to 90 days (escalation required)",
  "90+ Days — critically overdue (consider bad debt provision)",
]);

section("Client Statement");
body(
  "You can generate and print a formal Statement of Account for any client covering any date range. " +
  "This shows all invoices raised, payments received, and the outstanding balance."
);
numbered([
  "Go to Accounts Receivable.",
  "Click on the client name.",
  "Click Generate Statement.",
  "Select the Date Range and click Generate.",
  "Click Print or Export to PDF.",
]);

section("Unallocated Deposits & Credit Notes");
body(
  "When a client pays more than the invoice amount, or sends money in advance, " +
  "it is recorded as an Unallocated Deposit. You can later apply it to future invoices."
);
tip(
  "Always check the Unallocated Deposits column before chasing a client for payment — " +
  "they may have already paid more than you realise."
);

// ── CHAPTER 12: INVOICES ─────────────────────────────────────────────────────
newChapter(12, "Invoices");

section("Creating an Invoice");
numbered([
  "Open the container the invoice is for.",
  "Click the Invoices tab.",
  "Click + New Invoice.",
  "The system pre-fills the clearing charges from the container record.",
  "Add or remove line items as needed.",
  "Set the Invoice Date and Payment Due Date.",
  "Click Save Invoice.",
]);
example(
  "Invoice for Container Clearing",
  "Client: Dangote Industries Ltd\n" +
  "Container: TCKU3456789\n" +
  "Line Item 1: Clearing Service Fee — ₦850,000\n" +
  "Line Item 2: Transire Processing — ₦45,000\n" +
  "Sub-Total: ₦895,000  |  VAT (7.5%): ₦67,125  |  TOTAL: ₦962,125\n\n" +
  "Invoice INV-2026-0123 generated and ready to send to client."
);

section("Recording Invoice Payments (Collections)");
numbered([
  "Open the invoice from the Invoices tab or the AR ledger.",
  "Click Record Payment.",
  "Enter: Amount Received, Date, Payment Method, Reference.",
  "Click Save. The AR balance for this client updates instantly.",
]);

// ── CHAPTER 13: OVERHEAD EXPENSES ────────────────────────────────────────────
newChapter(13, "Overhead Expenses");

section("What Are Overhead Expenses?");
body(
  "Overhead expenses are company running costs that are NOT tied to a specific container job. " +
  "Examples include office rent, staff salaries, fuel, stationery, and utilities."
);

section("Recording an Overhead Expense");
numbered([
  "Go to Overhead Expenses from the sidebar.",
  "Click + New Expense.",
  "Select a Category (e.g. Rent, Salaries, Fuel).",
  "Enter: Amount, Description, Expense Date.",
  "Click Save.",
  "To record payment of this expense, click Record Payment on the expense row.",
  "Select Bank Account, enter Amount and Date, then click Save Payment.",
]);
example(
  "Monthly Office Rent",
  "Category: Rent\n" +
  "Amount: ₦450,000\n" +
  "Description: Office rent – June 2026\n" +
  "Expense Date: 01 June 2026\n\n" +
  "Payment recorded on 01 June: ₦450,000 via Zenith Bank (TRF/2026/060001)\n" +
  "Status: PAID"
);

// ── CHAPTER 14: REPORTS ──────────────────────────────────────────────────────
newChapter(14, "Reports");

section("Available Reports");
bullet([
  "Profit & Loss per Container — gross profit on each job (clearing charges minus total costs)",
  "Profit by Customer — total GP generated by each client",
  "Cashflow Report — money in (invoices/collections) vs money out (disbursements/expenses)",
  "Disbursement Reconciliation — budgeted costs vs actual payments per container",
  "FX History — all foreign currency charges with USD amounts, exchange rates, and NGN equivalents",
  "Duty Payments Ledger — all assessed, paid, and outstanding duty amounts",
  "Accounts Receivable Aging — full debtors ledger with aging buckets",
  "VAT Summary — VAT collected from clients vs VAT paid to agencies",
  "Gate Log — all gate-in and gate-out events with timestamps",
]);

section("Generating a Report");
numbered([
  "Go to Reports from the sidebar.",
  "Select the report type from the tabs at the top.",
  "Set your filters: Date Range, Client, Container, etc.",
  "Click Generate / Apply Filter.",
  "Review the results on screen.",
  "Click Export CSV, Export Excel, or Export PDF to download.",
]);

section("FX History Report");
body(
  "The FX History report shows all containers where a USD charge was recorded. " +
  "It is useful for tracking foreign currency exposure and reconciling exchange rate differences."
);
tableHeader(["Column", "Description"], shW);
const fxCols = [
  ["Container Number", "The job reference"],
  ["Section", "Which charge section the USD was recorded in"],
  ["USD Amount", "The original US Dollar amount"],
  ["Exchange Rate (₦/$)", "The rate used at the time of recording"],
  ["NGN Equivalent (₦)", "USD × Rate = the NGN charge applied"],
  ["Date Recorded", "When the FX charge was entered"],
];
fxCols.forEach((f, i) => tableRow(f, shW, i % 2 === 0));

// ── CHAPTER 15: APPROVALS ────────────────────────────────────────────────────
newChapter(15, "Approvals & Section Locking");

section("The Approval Workflow");
body(
  "To prevent unauthorised changes to financial data, documentation staff must SUBMIT each " +
  "charge section for Admin review before it is considered final. Admins then approve or reject. " +
  "Approved sections are locked from further edits."
);

sub("For Staff — Submitting a Section");
numbered([
  "Open the container and expand the charge section you have filled in.",
  "Review all the amounts carefully.",
  "Click Submit for Approval at the bottom of the section.",
  "The section status changes to 'Pending'. You cannot edit it while it is pending.",
]);

sub("For Admins — Reviewing a Submission");
numbered([
  "Go to Approval Queue from the sidebar (or check the Dashboard badge).",
  "Click on the pending submission.",
  "Review the amounts entered.",
  "Click Approve to lock the section — or Reject with a reason.",
  "If rejected, the staff member receives a notification and can make corrections.",
]);
example(
  "Rejection and Correction",
  "Admin rejects the Customs section with reason: 'CIU amount should be ₦85,000 not ₦850,000'\n\n" +
  "The documentation officer receives a notification, corrects the figure, and resubmits.\n" +
  "Admin approves. The Customs section is now locked with the correct figure."
);
warn(
  "Once a section is approved and locked, only a Super Admin or Admin can unlock it. " +
  "All unlock actions are recorded in the audit log."
);

// ── CHAPTER 16: NOTIFICATIONS & TASKS ────────────────────────────────────────
newChapter(16, "Notifications & Tasks");

section("In-App Notifications");
body(
  "The notification bell (top right) shows real-time alerts about events that need your attention."
);
bullet([
  "Your charge section has been approved",
  "Your charge section has been rejected (with reason)",
  "A container has been aging for more than X days",
  "A task assigned to you is due",
  "A container you are responsible for has been advanced to the next stage",
]);

section("Task Management");
body(
  "Tasks are action items linked to a specific container. They help the team track operational " +
  "to-dos without losing track of what needs to happen next."
);

sub("Creating a Task");
numbered([
  "Open the container.",
  "Click the Tasks tab.",
  "Click + Add Task.",
  "Enter: Task Title, Description, Assigned To (user), Due Date.",
  "Click Save Task.",
]);

sub("My Tasks View");
body(
  "Each user can click My Tasks in the sidebar to see only the tasks assigned to them, " +
  "sorted by due date. This is the personal to-do list for each team member."
);
example(
  "Operational Task Example",
  "Container: MSCU9876543\n" +
  "Task: Confirm gate-in with terminal supervisor\n" +
  "Assigned To: Chidi (Terminal Operations)\n" +
  "Due Date: 14 May 2026\n\n" +
  "Chidi sees this in his 'My Tasks' view and marks it complete once done."
);

// ── CHAPTER 17: DOCUMENTS & TIMELINE ─────────────────────────────────────────
newChapter(17, "Documents, Timeline & Audit Log");

section("Documents Tab");
body(
  "Every container has a Documents tab where you can upload and store all job-related files: " +
  "Bill of Lading, customs documents, terminal receipts, client invoices, exemption certificates, etc."
);
numbered([
  "Open the container and click the Documents tab.",
  "Click Upload Document.",
  "Select the file from your computer (PDF, JPG, PNG, Excel supported).",
  "Enter a Document Name / Label.",
  "Click Upload. The file is stored and accessible by all authorised users.",
]);

section("Timeline Tab");
body(
  "The Timeline shows the complete history of a container as a vertical list of events in " +
  "chronological order: every stage change, section submission, approval, rejection, gate event, and task."
);
tip("Use the Timeline when a client asks 'what happened to my container?' — it gives a complete picture.");

section("Audit Log Tab");
body(
  "The Audit Log is the most detailed record. For every change made to any field on the container, " +
  "it records:"
);
bullet([
  "Which user made the change",
  "What field was changed",
  "The old value (before the change)",
  "The new value (after the change)",
  "The exact date and time",
]);
example(
  "Audit Log Entry",
  "Date: 13 May 2026, 14:32:07\n" +
  "User: Ngozi Adeyemi (Accounts)\n" +
  "Action: Duty Payment Recorded\n" +
  "Field: dutyPaid\n" +
  "Old Value: ₦0.00  →  New Value: ₦7,000,000.00\n" +
  "Notes: date=2026-05-13 | Teller No. 004512, Access Bank"
);

// ── CHAPTER 18: GATE SECURITY ─────────────────────────────────────────────────
newChapter(18, "Gate Security Module");

section("Gate-In Recording");
body(
  "When a truck brings a container into the bonded terminal yard, the gate security officer " +
  "records the Gate-In event in COST. This creates an official timestamp for when the container " +
  "entered your custody."
);
numbered([
  "Log in with your Security account.",
  "Go to Gate Security from the sidebar.",
  "Search for the container by number.",
  "Click Record Gate-In.",
  "Confirm the date and time (auto-filled to now).",
  "Click Save. The container status updates to reflect it is physically in the yard.",
]);

section("Gate-Out Recording");
body(
  "When a container leaves the terminal on a truck for delivery, record the Gate-Out:"
);
numbered([
  "Search for the container.",
  "Click Record Gate-Out.",
  "Confirm the timestamp and click Save.",
]);

section("Gate Log & Export");
body(
  "The Gate Log shows all gate-in and gate-out events with container number, truck details, " +
  "security officer name, and timestamps. It can be exported to CSV for the port authority or audit."
);

// ── CHAPTER 19: SETTINGS ─────────────────────────────────────────────────────
newChapter(19, "Settings");

section("User Management");
body("Admins and Super Admins can manage all system users from Settings → User Management.");
bullet([
  "Create new user accounts with name, email, and password",
  "Assign roles (Super Admin, Admin, Accounts, Documentation, etc.)",
  "Set section-level permissions for documentation staff",
  "Deactivate users who have left the company",
]);

section("Workspace Access");
body(
  "Workspace Access controls which department-specific views are available to each role. " +
  "For example, the Terminal Workspace only shows containers at terminal-related stages."
);

section("Custom Fields");
body(
  "Admins can add new fields to any charge section, create new sections, and configure " +
  "dropdown options, labels, and whether a field is included in the section total."
);

section("System Version");
body(
  "The bottom-left of every page shows the current system version (e.g. v1.0.0 Enterprise). " +
  "Share this with your support team when reporting issues."
);

// ── CHAPTER 20: TIPS & BEST PRACTICES ────────────────────────────────────────
newChapter(20, "Tips, Best Practices & Common Mistakes");

section("Daily Workflow Checklist");
body("We recommend the following routine for each team:");

sub("Accounts Team — Start of Day");
bullet([
  "Check the Dashboard for new 'Awaiting Duty Payment' containers",
  "Check Approval Queue for any submitted sections needing review",
  "Open Duty Payments page and check outstanding balances",
  "Review AR aging for overdue invoices",
]);

sub("Documentation Staff — Start of Day");
bullet([
  "Check My Tasks for due items",
  "Check Notifications for any rejected sections to correct",
  "Open your assigned containers and update charge sections",
  "Submit completed sections for approval",
]);

sub("Operations Team — Start of Day");
bullet([
  "Open the Pipeline Board to see containers at your stage",
  "Check My Tasks for pending operational to-dos",
  "Record any gate events or stage updates",
]);

section("Common Mistakes to Avoid");
warn("Do not enter charges in the wrong section. For example, do not put terminal fees in the Operations section.");
warn("Always record the correct Duty Assessment amount in the Customs section BEFORE moving the container to Duty Payment stage.");
warn("Do not forget to submit a charge section for approval after filling it in. An unsaved section will not be included in reports.");
warn("Always link payments to the correct bank account so the bank balance stays accurate.");

section("Getting Help");
body(
  "If you encounter an issue or are unsure about any feature:"
);
bullet([
  "Check the Audit Log to see what changed and who changed it",
  "Contact your system administrator (Super Admin) for access or permission issues",
  "For technical issues, note the exact error message and the steps that led to it",
]);

// ── BACK COVER ────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.primary);
doc.fillColor(C.white).font("Helvetica-Bold").fontSize(22)
   .text("COST", doc.page.margins.left, doc.page.height / 2 - 60, { width: PW, align: "center" });
doc.fillColor("#bfdbfe").font("Helvetica").fontSize(13)
   .text("Container Clearing Management System", doc.page.margins.left, doc.page.height / 2 - 30, { width: PW, align: "center" });
doc.fillColor(C.white).font("Helvetica").fontSize(11)
   .text("Nigerian Bonded Terminal Container Clearing ERP\nVersion 1.0 Enterprise  ·  May 2026", doc.page.margins.left, doc.page.height / 2 + 10, { width: PW, align: "center", lineGap: 4 });
doc.fillColor("#93c5fd").fontSize(10)
   .text("Confidential — For Internal Use Only", doc.page.margins.left, doc.page.height - 80, { width: PW, align: "center" });

doc.end();
stream.on("finish", () => console.log("PDF generated:", OUTPUT));
stream.on("error", (e) => { console.error(e); process.exit(1); });
