# Cost Analysis Per Container

## Overview

Enterprise-grade container clearing cost analysis and operations management web application for a port clearing/logistics company. Built in three phases.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: JWT via httpOnly cookies (bcryptjs + jsonwebtoken)
- **Charts**: Recharts
- **Tables**: TanStack React Table
- **File parsing**: PapaParse (CSV), xlsx (Excel)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (auth, users, containers, charges)
│   └── cost-analysis/      # React + Vite frontend (login, dashboard, containers, upload, users)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seed.ts         # Admin user seeder
```

## Default Admin Credentials

- **Email**: admin@costanalysis.com
- **Password**: admin123

## Database Schema

- `users` — Staff/admin user accounts
- `containers` — Container records (customer, BL#, vessel, status, etc.)
- `shipping_charges` — Section 1 charges per container
- `customs_charges` — Section 2 charges per container
- `terminal_charges` — Section 3 charges per container
- `delivery_charges` — Section 4 charges per container
- `operations_charges` — Section 5 charges per container
- `audit_log` — Change history for all container records

## Phase Status

### Phase 1 (COMPLETE)
- Login system with JWT cookies
- Admin + staff user management
- Container records (upload from CSV/Excel, manual create)
- Container detail page with 5 charge sections (Shipping, Customs, Terminal, Delivery, Operations)
- Auto-calculation of Total Cost, Clearing Charges, Gross Profit
- Record locking (admin only)
- Audit trail per container
- Executive dashboard with charts (Containers by Status, Profit by Customer, Cost by Vessel)
- Alerts panel (low profit, outstanding duty)
- Smart container table with search, filter, pagination

### Phase 2 (PENDING)
- Section-based permission system
- Workflow engine (10 stages with progress bar, checklist, approval queue)
- Enhanced audit trail (field-level diffs)

### Phase 3 (PENDING)
- Dynamic Section Builder (admin creates custom sections/fields)
- Executive analytics (negative profit, high cost categories, staff productivity)
- Reports page with CSV export

## API Endpoints

- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `GET/POST /api/users` — List/create users (admin)
- `GET/PUT /api/users/:id` — Get/update user (admin)
- `GET /api/containers` — List containers (search, filter, paginate)
- `POST /api/containers` — Create container
- `POST /api/containers/upload` — Bulk upload from CSV/Excel
- `GET/PUT /api/containers/:id` — Get/update container
- `POST /api/containers/:id/lock` — Lock/unlock (admin)
- `GET/PUT /api/containers/:id/charges` — Get/update charges by section
- `GET /api/containers/:id/audit` — Audit log
- `GET /api/dashboard/stats` — Dashboard summary statistics
