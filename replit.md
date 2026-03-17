# Cost Analysis Per Container

## Overview

Enterprise-grade container clearing cost analysis and operations management web application for a Nigerian port clearing/logistics company. All costs are displayed in Nigerian Naira (₦). No pre-seeded data — admin creates first account via `/setup`.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: JWT via httpOnly cookies (bcryptjs + jsonwebtoken)
- **Charts**: Recharts
- **File uploads**: multer (documents stored in `artifacts/api-server/uploads/`)
- **File parsing**: PapaParse (CSV), xlsx (Excel)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── cost-analysis/      # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec (openapi.yaml) + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
```

## Setup

Admin first creates their account at `/setup`. Staff accounts are created by the admin via User Management.

## Database Schema

### Core tables
- `users` — Staff/admin user accounts with section-level permissions
- `containers` — Container records (customer, BL#, vessel, status, clearing charges, etc.)
- `shipping_charges` — Section 1 charges per container
- `customs_charges` — Section 2 charges per container (includes duty tracking)
- `terminal_charges` — Section 3 charges per container
- `delivery_charges` — Section 4 charges per container
- `operations_charges` — Section 5 charges per container
- `section_approvals` — Per-section approval states (pending/approved/rejected)
- `audit_log` — Full change history with field-level diffs

### Phase 3 tables
- `container_timeline` — Event log per container (12 event types, status colors)
- `container_tasks` — Task management per container (priority, due dates, assignee)
- `container_documents` — Document attachments (multer uploads, section categorization)
- `custom_sections` — Admin-defined custom sections with color coding
- `custom_fields` — Custom fields within sections (text, number, date, dropdown, etc.)
- `custom_field_values` — Per-container values for custom fields

## Phase Status

### Phase 1 ✅ COMPLETE
- Login system with JWT cookies
- Admin + staff user management
- Container records (upload from CSV/Excel, manual create)
- Container detail page with 5 charge sections (Shipping, Customs, Terminal, Delivery, Operations)
- Auto-calculation of Total Cost, Clearing Charges, Gross Profit
- Record locking (admin only)
- Audit trail per container
- Executive dashboard with charts
- Smart container table with search, filter, pagination

### Phase 2 ✅ COMPLETE
- Granular section-level permission system (view/edit per section per user)
- 10-stage workflow engine with progress bar and checklist
- Section submit → approval workflow
- Approval queue page (admin reviews/approves/rejects each section)
- My Tasks page (staff sees their pending sections)
- Role-aware dashboard (admin sees pending approvals; staff sees their open tasks)
- Enhanced audit trail with field-level before/after diffs

### Phase 3 ✅ COMPLETE
All 8 remaining features implemented:

1. **Operations Timeline** — Per-container event log with 12 event types and color-coded statuses. Add/delete events with timestamp and notes.

2. **Task Manager** — Per-container tasks with priorities (low/medium/high/urgent), due dates, staff assignment, status tracking, and overdue detection.

3. **Document Attachments** — File upload (PDF/images/Excel/Word up to 20MB), categorized by section, download/delete, multer-backed storage.

4. **Printable Container Summary** — `/containers/:id/print` opens a clean print-ready HTML page with full cost breakdown, approval status, profit/loss highlight, and a "Print/Save PDF" button.

5. **Profit Intelligence Alerts** — Dashboard panel using `/api/intelligence/alerts` — detects loss-making containers, low margins, outstanding duty, delayed operations, stale approvals, and overdue tasks.

6. **Enhanced Search & Filters** — Container list now has expandable filter panel: Profit Status (profitable/low margin/loss), Created From/To date range, animated show/hide with clear-all.

7. **Reports with Type Tabs** — Reports page now has 5 tabs: All Containers, Profitable, Loss-Making, Outstanding Duty, Completed — filters the displayed results and export count.

8. **Section Builder** — Admin-only inline tab ("Edit Sections") embedded in container detail page for creating custom sections with color coding, custom fields, and role visibility.

### Phase 4 ✅ COMPLETE

1. **Clients Feature** — Full CRUD for client accounts; DB table + nullable `clientId` FK on containers; API routes at `/api/clients`; Clients list page + Client detail page showing linked containers and financial stats.

2. **Enhanced Reports Page** — 5 report tabs: All Containers (with profitable/loss/duty/completed sub-tabs), Client Report (grouped by customer), Operations (by vessel & size), Financial (cost breakdown by category), Monthly Summary. Exports: CSV, Excel (4-sheet xlsx), PDF (browser print).

3. **Container-to-Client Linking** — Container detail page hero card shows linked client (clickable link to client page). Admin can link/unlink any container to a client via a dropdown dialog. API: `PATCH /api/clients/:id/link-container` and `PATCH /api/containers/:id/unlink-client`.

4. **API Server Fix** — Removed zod import from clients route (not available in api-server package); replaced with manual field validation. `formatContainer` now returns `clientId` and `clientName`.

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `POST /api/setup` — Create first admin account

### Users
- `GET/POST /api/users` — List/create users (admin)
- `GET/PUT /api/users/:id` — Get/update user (admin)

### Containers
- `GET /api/containers` — List (search, status filter, paginate)
- `POST /api/containers` — Create
- `POST /api/containers/upload` — Bulk CSV/Excel upload
- `GET/PUT /api/containers/:id` — Get/update
- `POST /api/containers/:id/lock` — Lock/unlock (admin)
- `PUT /api/containers/:id/charges` — Update charges by section
- `GET /api/containers/:id/audit` — Audit log
- `POST /api/containers/:id/submit/:section` — Submit section for approval
- `GET /api/containers/:id/section-approvals` — Approval status

### Timeline
- `GET /api/containers/:id/timeline` — Get events
- `POST /api/containers/:id/timeline` — Add event
- `DELETE /api/containers/:id/timeline/:eventId` — Delete event

### Tasks
- `GET /api/containers/:id/tasks` — List tasks
- `POST /api/containers/:id/tasks` — Create task
- `PUT /api/containers/:id/tasks/:taskId` — Update task
- `DELETE /api/containers/:id/tasks/:taskId` — Delete task

### Documents
- `GET /api/containers/:id/documents` — List docs
- `POST /api/containers/:id/documents` — Upload (multipart/form-data)
- `DELETE /api/containers/:id/documents/:docId` — Delete
- `GET /api/documents/:filename` — Serve uploaded file

### Intelligence & Analytics
- `GET /api/intelligence/alerts` — Smart alerts (profit/delay/overdue)
- `GET /api/analytics` — Aggregated analytics data
- `GET /api/reports/containers` — Container report (filtered)
- `GET /api/reports/export` — CSV export

### Approvals
- `GET /api/approvals/pending` — All pending approvals (admin)
- `POST /api/approvals/:containerId/:section/approve` — Approve
- `POST /api/approvals/:containerId/:section/reject` — Reject

### My Tasks
- `GET /api/my-tasks` — Staff's own pending sections

### Dashboard
- `GET /api/dashboard/stats` — KPI stats + alerts summary

### Clients
- `GET /api/clients` — List/search clients
- `POST /api/clients` — Create client (admin)
- `GET /api/clients/:id` — Get client + linked containers
- `PATCH /api/clients/:id` — Update client (admin)
- `DELETE /api/clients/:id` — Delete client, unlinks containers (admin)
- `PATCH /api/clients/:id/link-container` — Link container to client (admin)
- `PATCH /api/containers/:id/unlink-client` — Unlink container from client (admin)

### Section Builder
- `GET /api/custom-sections` — List sections with fields
- `POST /api/custom-sections` — Create section
- `PUT /api/custom-sections/:id` — Update section
- `DELETE /api/custom-sections/:id` — Delete section
- `POST /api/custom-sections/:id/fields` — Add field
- `PUT /api/custom-sections/:id/fields/:fieldId` — Update field
- `DELETE /api/custom-sections/:id/fields/:fieldId` — Delete field
- `GET /api/containers/:id/custom-field-values` — Get values
- `POST /api/containers/:id/custom-field-values` — Save values

## Key Files

### Frontend pages
- `src/pages/dashboard.tsx` — KPI dashboard + Intelligence Alerts Panel
- `src/pages/containers/index.tsx` — Container list + expandable filter panel
- `src/pages/containers/[id].tsx` — Container detail (Charges / Timeline / Tasks / Documents / Audit tabs)
- `src/pages/containers/print/[id].tsx` — Print-ready container summary
- `src/pages/analytics/index.tsx` — Analytics charts (Recharts)
- `src/pages/reports/index.tsx` — Enhanced reports: 5 tabs (All Containers, Client, Operations, Financial, Monthly), CSV/Excel/PDF export
- `src/pages/clients/index.tsx` — Clients list with CRUD
- `src/pages/clients/[id].tsx` — Client detail with linked containers + financial stats
- `src/pages/approvals/index.tsx` — Admin approval queue
- `src/pages/my-tasks/index.tsx` — Staff task overview

### Frontend components
- `src/components/containers/TimelineTab.tsx`
- `src/components/containers/TasksTab.tsx`
- `src/components/containers/DocumentsTab.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/auth-provider.tsx`

### Backend routes
- `artifacts/api-server/src/routes/` — All 14 route files

### API codegen
- `lib/api-spec/openapi.yaml` — Source of truth for all endpoints
- `lib/api-client-react/src/generated/api.ts` — Generated React Query hooks
- Regen command: `cd lib/api-spec && pnpm exec orval --config orval.config.ts && cd lib/api-client-react && pnpm exec tsc --project tsconfig.json`

## Known Pre-Existing TS Errors (safe to ignore)
- `auth-provider.tsx` — TanStack Query v5 `queryKey` issue
- `containers/index.tsx` — `keepPreviousData` renamed in TanStack v5
- `dashboard.tsx` — `queryKey` in staleTime option
- `reports/index.tsx` — `queryKey` in enabled option
- `containers/upload.tsx` — missing `@types/papaparse`

## Financial Calculations
All calculations in `artifacts/api-server/src/lib/calculations.ts`:
- `calcTotalCost(charges)` — Sum of all 5 sections
- `sumShipping/Customs/Terminal/Delivery/Operations(section)` — Per-section totals
- Gross Profit = Clearing Charges − Total Cost
