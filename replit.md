# Cost Analysis Per Container

## Overview

This project is an enterprise-grade web application designed for Nigerian port clearing and logistics companies. Its primary purpose is to provide comprehensive cost analysis and operations management for container clearing processes. The application tracks all associated costs in Nigerian Naira (₦) and aims to streamline financial and operational workflows.

Key capabilities include:
- Management of container records and associated charges across five distinct sections (Shipping, Customs, Terminal, Delivery, Operations), each with unlimited custom line items (extra charges).
- Automated calculation of total costs, clearing charges, and gross profit.
- Robust user and role management with granular, section-level permissions.
- Workflow engine for section approvals and task management.
- Detailed audit trails with field-level change tracking.
- Advanced reporting and analytics features, including profit intelligence alerts.
- Full invoice and payment tracking, including multi-container invoicing and WhatsApp integration for client communication.
- Client management with financial summaries and receivables tracking.
- Custom section and field builder for administrative flexibility.
- Delivery tracking: admins can record/edit physical delivery dates per container; estimated flag shown for auto-backfilled dates.
- Delivery Report: `/reports` page shows an interactive delivery tracking section with date-range filtering, stat cards (count, revenue, avg days), breakdown table, and a printable report at `/reports/delivery-report/print`.

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
    -   **Granular Permissions:** A section-level permission system controls user access to specific parts of container data.
    -   **Workflow Engine:** A 10-stage workflow with approval queues facilitates operational processes.
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