# Cost Analysis Per Container

## Overview
This project is an enterprise-grade web application designed for Nigerian port clearing and logistics companies. Its primary purpose is to provide comprehensive cost analysis and operations management for container clearing processes. The application tracks all associated costs in Nigerian Naira (₦), offering features for managing container records, charges across various sections (shipping, customs, terminal, delivery, operations), and financial calculations like total cost and gross profit. The system supports user management with granular permissions, workflow automation for approvals, task management, document attachments, and robust reporting capabilities. Future enhancements include advanced client management, invoicing, and payment tracking with WhatsApp integration for client communication. The long-term vision is to streamline logistics operations, improve financial transparency, and enhance decision-making for port clearing businesses.

## User Preferences
I want to be addressed in a formal and professional manner. I prefer detailed explanations for complex technical concepts, but concise summaries for routine updates. I value an iterative development approach with regular, small updates rather than large, infrequent releases. Please ask for my confirmation before making any major architectural changes or significant modifications to existing features. I prefer to review code changes that include clear comments, especially for business logic or complex algorithms. Do not make changes to the `artifacts-monorepo/artifacts/api-server/src/lib/calculations.ts` file without explicit instruction.

## System Architecture

### UI/UX Decisions
The frontend is built with React, Vite, Tailwind CSS, and shadcn/ui for a modern and responsive user interface. Framer Motion is used for animations to enhance user experience. The design prioritizes clarity, ease of navigation, and efficient data presentation. Key UI components include:
- Executive dashboard with charts (Recharts) for KPIs and trends.
- Smart container tables with search, filter, and pagination.
- Role-aware dashboards presenting relevant information to admins and staff.
- Printable container summaries for easy export.
- Expandable filter panels and intuitive forms for data entry.
- Visual cues like color-coded statuses for timelines and aging alerts.

### Technical Implementations
The application is structured as a pnpm monorepo.
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion.
- **Backend (API)**: Express 5, Node.js 24.
- **Database**: PostgreSQL with Drizzle ORM for type-safe schema definition and queries.
- **Authentication**: JWT via httpOnly cookies, secured with bcryptjs for password hashing and jsonwebtoken.
- **Validation**: Zod for schema validation across API endpoints.
- **API Codegen**: Orval is used to generate React Query hooks and Zod schemas from an OpenAPI specification (`openapi.yaml`), ensuring strong type consistency between frontend and backend.
- **File Handling**: `multer` for secure file uploads (documents stored in `artifacts/api-server/uploads/`) and `PapaParse` (CSV) / `xlsx` (Excel) for file parsing.
- **Monorepo Structure**: The project is organized into `artifacts/api-server` (Express API) and `artifacts/cost-analysis` (React frontend), with shared `lib/` packages for API specifications, client code, and database logic.

### Feature Specifications
The system encompasses a wide range of features:
- **User Management**: Admin and staff accounts with granular, section-level permissions (view/edit) and an initial `/setup` process for the first admin.
- **Container Management**: CRUD operations for container records, bulk upload via CSV/Excel, record locking, and comprehensive detail pages with 5 charge sections (Shipping, Customs, Terminal, Delivery, Operations).
- **Workflow & Approvals**: A 10-stage workflow engine with progress tracking, section submission, and admin approval queues.
- **Operations & Tasks**: Per-container event timelines with 12 event types, and a task manager with priorities, due dates, and staff assignment.
- **Document Management**: Attachment of various file types (PDF, images, Excel, Word) categorized by section.
- **Financial Intelligence**: Automated calculation of Total Cost, Clearing Charges, Gross Profit, and Profit Intelligence Alerts for identifying loss-making containers, low margins, and outstanding duties.
- **Reporting & Analytics**: Executive dashboard with charts, enhanced reporting pages with multiple views (e.g., Profitable, Loss-Making, Outstanding Duty), and export functionality (CSV, Excel, PDF).
- **Customization**: Admin-only "Section Builder" for creating custom sections and fields with role visibility.
- **Client Management**: Full CRUD for client accounts, linking containers to clients, and client-specific financial statistics.
- **Invoicing & Payments**: Full invoice lifecycle management (creation, status tracking, payment recording), WhatsApp integration for sending invoices and reminders, and Accounts Receivable (AR) KPIs.
- **Notifications & Settings**: Persistent notification system with read/unread tracking, user-specific alerts, and an admin settings page for configuring aging thresholds and email recipients.
- **API Design**: RESTful API endpoints for all functionalities, documented and code-generated from an OpenAPI specification.

## External Dependencies

- **Database**: PostgreSQL
- **Authentication**: `bcryptjs` (password hashing), `jsonwebtoken` (JWT creation/verification)
- **UI Components**: `shadcn/ui`
- **Charting**: `Recharts`
- **Animations**: `Framer Motion`
- **File Uploads**: `multer`
- **CSV Parsing**: `PapaParse`
- **Excel Parsing**: `xlsx`
- **API Specification**: `Orval` (for code generation from OpenAPI)
- **Validation**: `Zod`, `drizzle-zod`
- **Email Service**: Resend (optional, requires `RESEND_API_KEY` and verified sender domain)
- **WhatsApp Integration**: `wa.me` links (free, no API) for basic messaging; optional Twilio API for direct messaging (requires Twilio credentials).