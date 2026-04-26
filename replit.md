# Cost Analysis Per Container

## Overview

This project is an enterprise-grade web application designed for Nigerian port clearing and logistics companies. Its primary purpose is to provide comprehensive cost analysis and operations management for container clearing processes. The application tracks all associated costs in Nigerian Naira (₦) and aims to streamline financial and operational workflows.

Key capabilities include:
- Management of container records and associated charges across five distinct sections (Shipping, Customs, Terminal, Delivery, Operations), each with unlimited custom line items (extra charges).
- Automated calculation of total costs, clearing charges, and gross profit.
- Robust user and role management with a complete 8-role hierarchy: Super Admin (full system control), Admin (operational oversight), Staff (granular section permissions), and 5 department roles (Documentation, Accounts, Operations, Terminal Manager, Delivery/Transport).
- Workflow engine for section approvals and task management.
- Detailed audit trails with field-level change tracking.
- Advanced reporting and analytics features, including profit intelligence alerts.
- Full invoice and payment tracking, including multi-container invoicing and WhatsApp integration for client communication.
- Client management with financial summaries and receivables tracking. Clients page supports Add One / Bulk Upload (Excel) / Download Template.
- Custom section and field builder for administrative flexibility.
- Delivery tracking: admins can record/edit physical delivery dates per container; estimated flag shown for auto-backfilled dates.
- Delivery Report: `/reports` page shows an interactive delivery tracking section with date-range filtering, stat cards (count, revenue, avg days), breakdown table, and a printable report at `/reports/delivery-report/print`.
- Notifications page (`/notifications`): persistent smart alerts with unread/read tracking (notificationsReadTable), Bell icon in sidebar with live unread badge; alerts for negative profit, low margin, high terminal/delivery cost, unpaid duty, aging delays, inactivity, overdue tasks, and overdue next actions.
- Stage Control Engine: four accountability fields added to each container — Stage Owner, Next Action, Next Action Due Date, Delay Reason. Editable from the container detail Hero card (ShieldCheck icon). Containers list shows a "Control" column with owner badge + overdue date warning. Operations pipeline board shows stageOwnerName and nextActionDueAt on each card. When a container advances stage, nextAction and nextActionDueDate are automatically cleared. Overdue next actions generate `action_overdue` notifications.
- Upload page: supports two modes — general upload (no client link) and customer-linked upload (passes clientId to associate containers with a client on creation).
- Add Container dialog: selecting a client from "Link to Client" auto-fills the Customer Name field; if Customer Name is left blank, the linked client's name is used as a fallback (validated on both client and server — `POST /containers` resolves the canonical name from `clientId` when `customerName` is empty/whitespace).
- Container Directory: a "Download" dropdown next to the Filters button exports the currently filtered/sorted rows to Excel (.xlsx) or PDF (.pdf), powered by `src/lib/exportContainers.ts` (xlsx + jspdf + jspdf-autotable).
- Department workspace pages (operations, delivery, accounts, documentation, terminal) each expose two tabs: **Active** (containers in this department's stages, original layout) and **Submitted / Closed Jobs** (containers that have moved past this department, showing search + Edit + View per row). Backed by `src/components/workspace/completed-jobs-view.tsx` and a new comma-separated `status` filter on `GET /api/containers` (status accepts e.g. `delivery,closed`).

The project's vision is to offer a complete solution for logistics companies to manage their container clearing operations efficiently, gain insights into profitability, and improve client communication.

## User Preferences

I want iterative development.
I prefer to be asked before major changes are made to the codebase.
I like to keep the commit history clean and linear.
I prefer clear and concise explanations for any code changes or architectural decisions.
Do not make changes to files within `artifacts/api-server/src/routes/` unless specifically requested or absolutely necessary for new feature implementation.
Do not modify the existing `lib/api-spec/openapi.yaml` without prior discussion.
Do not change the established monorepo structure in `artifacts-monorepo/`.

## System Architecture

The application is built as a monorepo using pnpm workspaces, separating the frontend and backend.

**Frontend:**
-   **Framework:** React with Vite for fast development and bundling.
-   **Styling:** Tailwind CSS for utility-first styling, complemented by shadcn/ui components for a polished look and Framer Motion for animations.
-   **UI/UX:** The design prioritizes a clean, functional interface with intuitive navigation. Color schemes are professional, and data visualization relies on Recharts for clear presentation of financial and operational metrics.
-   **Interaction:** Features like smart tables with search, filter, and pagination, along with interactive dashboards and detailed views, ensure a rich user experience.
-   **API Client:** Generated using Orval from an OpenAPI specification, providing type-safe React Query hooks for API interaction.

**Backend:**
-   **API Framework:** Express 5 handles API requests.
-   **Database:** PostgreSQL is used as the relational database, managed by Drizzle ORM for type-safe schema definition and queries.
-   **Validation:** Zod is employed for robust data validation across API endpoints.
-   **Authentication:** JWT-based authentication via httpOnly cookies, secured with bcryptjs for password hashing and jsonwebtoken.
-   **File Management:** `multer` is used for handling file uploads (documents stored in `artifacts/api-server/uploads/`). `PapaParse` and `xlsx` libraries handle CSV and Excel file parsing for bulk data uploads.
-   **Core Logic:** Financial calculations are centralized in `artifacts/api-server/src/lib/calculations.ts`.
-   **System Design:**
    -   **Monorepo Structure:** Clearly defined workspaces for `api-server`, `cost-analysis`, and shared `lib` components (`api-spec`, `api-client-react`, `api-zod`, `db`).
    -   **Role Hierarchy:** `super_admin` (create/delete users, system settings, full control) > `admin` (operations, approvals, reports, assign clients, view users) > `staff` (section-level) > 5 department roles. Backend: `requireAdmin` accepts both admin+super_admin; `requireSuperAdmin` is super_admin only. Existing setup creates the first user as super_admin. Setup command upgrade: all existing `admin` accounts in DB are upgraded to `super_admin`.
    -   **Role-Based Workflow System:** 5 dedicated department roles (`documentation_user`, `accounts_user`, `operations_user`, `terminal_manager`, `delivery_user`) each get a focused workspace page showing only their stage's containers with submit buttons to advance jobs. Department roles also get a simplified sidebar showing only their workspace. Stage advancement permissions are enforced on the backend by `DEPT_OWNED_STAGES` mapping.
    -   **Department Workspace Pages:** `/workspace/documentation` (registered→duty_assessment), `/workspace/accounts` (duty_payment), `/workspace/operations` (transire→pull_out), `/workspace/terminal` (gate_in→final_release), `/workspace/delivery` (delivery→empty_return).
    -   **Granular Permissions:** A section-level permission system controls user access to specific parts of container data (for `staff` role).
    -   **Workflow Engine:** A 13-stage bonded terminal pipeline (registered → documentation → duty_assessment → duty_payment → transire_processing → shipping_terminal_payment → pull_out → gate_in → examination → final_release → delivery → empty_return → closed) with a pre-pipeline verification gate (`pending_verification`), approval queues, and dedicated operational workflow views.
    -   **Audit Trail:** Comprehensive logging captures field-level changes for all critical data.
    -   **Customization:** An admin-only Section Builder allows for dynamic creation of custom sections and fields, enhancing flexibility.
    -   **Financials:** Invoice creation accounts for clearing charges, VAT, and tracks payment statuses. Receivables tracking provides client-specific financial summaries.

## External Dependencies

-   **Database:** PostgreSQL
-   **ORM:** Drizzle ORM
-   **API Specification:** OpenAPI (used with Orval for client code generation)
-   **Charting:** Recharts
-   **File Uploads:** `multer`
-   **CSV Parsing:** `PapaParse`
-   **Excel Parsing:** `xlsx`
-   **Authentication:** `bcryptjs`, `jsonwebtoken`
-   **Validation:** `Zod`, `drizzle-zod`
-   **WhatsApp Integration:** `wa.me` links for click-to-send messages; optional integration with Twilio WhatsApp Business API if credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`) are provided.
-   **Email Alerts:** Resend (currently not connected; requires `RESEND_API_KEY` to be set or integration connected).