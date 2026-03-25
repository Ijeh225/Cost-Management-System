# Cost Analysis Per Container

## Overview
This project is an enterprise-grade web application for Nigerian port clearing and logistics companies. Its primary purpose is to provide comprehensive cost analysis and operations management for container clearing processes. The application tracks all costs in Nigerian Naira (₦) and aims to streamline financial operations, enhance visibility into container clearing costs, and improve overall operational efficiency. Key capabilities include managing container records, tracking various charges (shipping, customs, terminal, delivery, operations), automating financial calculations, and providing detailed reporting and analytics. The project envisions becoming an indispensable tool for logistics companies to optimize profitability, manage client relationships, and ensure compliance with customs procedures.

## User Preferences
I want to be addressed in a straightforward and professional manner. I appreciate clear, concise explanations and prefer an iterative development approach where I can provide feedback at each stage. Before making any major architectural changes or introducing new external dependencies, please ask for my approval. Ensure that the codebase remains clean, well-documented, and follows best practices.

## System Architecture
The application is built as a monorepo using `pnpm workspaces`.

### Frontend
-   **Framework**: React with Vite
-   **Styling**: Tailwind CSS, shadcn/ui
-   **Animation**: Framer Motion
-   **Charts**: Recharts
-   **UI/UX**: Focuses on a clean, modern interface suitable for enterprise use, with consistent design components provided by shadcn/ui. Intuitive navigation and dashboards are central to the user experience.

### Backend
-   **API Framework**: Express 5
-   **Database**: PostgreSQL with Drizzle ORM
-   **Validation**: Zod
-   **Authentication**: JWT via httpOnly cookies (using bcryptjs and jsonwebtoken)
-   **API Codegen**: Orval for generating API clients and Zod schemas from an OpenAPI specification.

### Core Features
-   **User Management**: Admin and staff accounts with granular, section-level permissions. Initial admin setup via `/setup`.
-   **Container Management**: Comprehensive CRUD for container records, including bulk upload from CSV/Excel. Each container features five detailed charge sections (Shipping, Customs, Terminal, Delivery, Operations).
-   **Financial Calculations**: Automated calculation of Total Cost, Clearing Charges, Gross Profit, and support for invoice subtotal calculations.
-   **Workflow Engine**: A 10-stage workflow engine with progress tracking, checklist, section submission for approval, and an approval queue for administrators.
-   **Audit Trail**: Full change history per container with field-level diffs.
-   **Reporting & Analytics**: Executive dashboard with KPIs, various reports (e.g., profitable, loss-making, outstanding duty, completed containers, client reports, operations reports, financial reports, monthly summaries) with export options (CSV, Excel, PDF).
-   **Operations Timeline**: Per-container event logging with 12 event types and color-coded statuses.
-   **Task Manager**: Per-container task management with priorities, due dates, assignee, and status tracking.
-   **Document Management**: File uploads (PDF, images, Excel, Word up to 20MB) categorized by section.
-   **Custom Section Builder**: Admin-defined custom sections with color coding, custom fields (text, number, date, dropdown), and role-based visibility.
-   **Client Management**: Full CRUD for client accounts, linking containers to clients, and financial tracking per client.
-   **Invoice & Payment Tracking**: Lifecycle management for invoices (draft, sent, paid, partial, overdue), payment recording, and automated outstanding balance calculation. Includes WhatsApp integration for sending invoice details.
-   **Notifications System**: Persistent read/unread alert tracking, with an in-app notification page and a sidebar badge for unread alerts.
-   **Aging Alerts**: Configurable thresholds for container aging and inactivity, with visual badges and alerts.
-   **Settings Management**: Admin-only section for configuring system-wide settings like aging thresholds and email recipients.

### Monorepo Structure
-   `artifacts/api-server/`: Express API server.
-   `artifacts/cost-analysis/`: React + Vite frontend.
-   `lib/api-spec/`: OpenAPI specification and Orval configuration.
-   `lib/api-client-react/`: Generated React Query hooks.
-   `lib/api-zod/`: Generated Zod schemas.
-   `lib/db/`: Drizzle ORM schema and database connection.

### Data Storage
-   File uploads are stored locally in `artifacts/api-server/uploads/`.

## External Dependencies
-   **Database**: PostgreSQL
-   **API Specification**: OpenAPI (for `openapi.yaml`)
-   **File Parsing**: PapaParse (CSV), xlsx (Excel)
-   **Email Service**: Resend (connector available but currently not activated by user; requires `RESEND_API_KEY`)