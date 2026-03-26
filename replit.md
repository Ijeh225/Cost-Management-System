# Cost Analysis Per Container

## Overview

This project is an enterprise-grade web application designed for a Nigerian port clearing and logistics company. Its primary purpose is to provide comprehensive cost analysis and operations management for container clearing processes. The system handles all financial calculations in Nigerian Naira (₦).

Key capabilities include:
- Tracking and managing various charges associated with container clearing (shipping, customs, terminal, delivery, operations).
- Automated calculation of total cost, clearing charges, and gross profit.
- Robust user and role management with granular permissions.
- Workflow automation for section approvals.
- Detailed audit trails and reporting functionalities.
- Client management and invoice processing with payment tracking.
- Operational tools like timeline tracking, task management, and document handling per container.
- Intelligence alerts for financial performance and operational bottlenecks.

The business vision is to streamline complex logistics operations, provide financial transparency, and improve decision-making through real-time data and analytics, thereby enhancing efficiency and profitability for port clearing businesses in Nigeria.

## User Preferences

No specific user preferences were provided in the original `replit.md` file.

## System Architecture

The application is built as a pnpm monorepo, separating the frontend and backend into distinct packages.

**Technology Stack:**
- **Backend:** Node.js 24, Express 5.
- **Frontend:** React, Vite, Tailwind CSS, shadcn/ui, Framer Motion.
- **Database:** PostgreSQL with Drizzle ORM.
- **Data Validation:** Zod.
- **API Communication:** OpenAPI specification for API definition, Orval for client code generation (React Query hooks, Zod schemas).
- **Authentication:** JWT via httpOnly cookies, using bcryptjs for password hashing and jsonwebtoken.
- **Charts:** Recharts.
- **File Management:** Multer for uploads, PapaParse for CSV, xlsx for Excel parsing.

**Architectural Patterns & Design Decisions:**
- **Monorepo Structure:** Facilitates code sharing and consistent development practices between frontend and backend.
- **API-First Design:** OpenAPI specification (`openapi.yaml`) serves as the single source of truth for all API endpoints, ensuring strong typing and consistency across frontend and backend.
- **Modular Database Schema:** Core tables are logically separated for containers, charges (5 sections), approvals, and audit logs. Additional tables support advanced features like timelines, tasks, documents, custom sections, invoicing, and notifications.
- **Granular Permissions:** A robust permission system allows view/edit control at the section level for different user roles.
- **Workflow Engine:** Implements a 10-stage workflow with approval mechanisms for each charge section, improving operational control.
- **UI/UX:** Utilizes Tailwind CSS and shadcn/ui for a modern, responsive, and consistent user interface. Framer Motion is used for animations to enhance user experience.
- **Financial Calculation Module:** All financial calculations are centralized in `artifacts/api-server/src/lib/calculations.ts` to ensure accuracy and consistency.
- **Client-Side Data Fetching:** React Query is used for efficient data fetching, caching, and state management on the frontend, generated from the OpenAPI spec.
- **Invoice & Payment Tracking:** Features a complete invoice lifecycle with payment recording, status tracking, and automated outstanding balance calculation. Supports both single and multi-container invoices.
- **Custom Section Builder:** Admin users can define custom sections and fields dynamically, providing flexibility for evolving business needs.
- **Reporting & Analytics:** Comprehensive reporting capabilities with various views (All Containers, Profitable, Loss-Making, Outstanding Duty, Completed, Client, Operations, Financial, Monthly Summary) and export options (CSV, Excel, PDF).
- **Notifications System:** Persistent, read/unread alert tracking with a dedicated notifications page and unread badges.

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Resend:** (Optional/Dismissed by user) Email service for sending email digests. Requires `RESEND_API_KEY` to be configured. The service uses `alerts@updates.costanalysis.app` as the sender address.
- **Twilio:** (Optional) For direct WhatsApp Business API integration. Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` to be configured for sending WhatsApp messages directly. The system can function via `wa.me` links without these credentials.
- **Maersk API:** (Implicit) For "Track Live" functionality of Maersk containers, though specific API integration details are not provided, it's inferred from the tracking feature.