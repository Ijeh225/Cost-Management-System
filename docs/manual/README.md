# Application Blueprint and User Manual

Edition 1.0, reviewed 2026-09-05 against application baseline `8d62f2c`.

- Final document: [Blueprint and User Manual](../../output/pdf/Cost_Management_Blueprint_and_User_Manual.pdf)
- Maintained content: [APPLICATION_MANUAL.md](APPLICATION_MANUAL.md)
- Builder: [build_manual.py](build_manual.py)
- Original read-only live screenshots: `assets/` (seven images, 1440 x 1000).

## Build

Use Python with ReportLab and pypdf. The renderer additionally uses PyMuPDF
and Pillow. The builder uses installed Calibri or DejaVu Sans fonts.

```powershell
python docs/manual/build_manual.py --render
```

The source supports chapter headings (`#`), subheadings (`##`), paragraphs,
flat lists, Markdown tables, callouts (`>`), `!SCREEN(name|caption)` and
`!DIAGRAM(architecture|workflow|money|invoice)` directives. For DIAGRAM,
choose one of the four names, not the pipe-separated alternatives literally.

Final PDF is under `output/pdf/`. Rendered QA pages, contact sheets and extracted
text are under ignored `tmp/pdfs/`. Rebuilding requires no app login, database
access or business-data mutation. Screenshot capture is intentionally not an
automatic step in the builder; refresh screenshots only through an authorized
read-only session and never embed credentials in scripts or records.

## Review Rules

1. Read PROJECT_STATE, LIVE_E2E_TEST_REGISTER and the latest session summary.
2. Resolve old status conflicts using current authoritative sections.
3. Verify changed source rules and distinguish live evidence from source review.
4. Update the edition/date/baseline in source and builder where appropriate.
5. Build, render every page and inspect page breaks, diagrams, screenshots and
   tables. Check bookmarks, text boundaries, required chapters and example math.
6. Update the three continuity records and commit the source, assets and PDF.

## This Edition's Evidence

- 57 pages, 54 chapters, 7 screenshots and 4 vector diagrams.
- Text extraction, 54 bookmarks, chapter coverage, page-boundary and worked
  arithmetic checks passed. All pages rendered and contact sheets inspected,
  with full-size review of dense tables, source appendix and diagrams.
- Snapshot captures: Dashboard, Operations, Reports, Payment Schedules,
  invoice 8, Terminal/TDO workspace and Gate Security on 2026-09-05.
- No finance, workflow, account-permission or configuration writes were made.
  Owner authentication was used for a separate read-only capture session.
- Closed remediation records remain historical evidence, not newly repeated
  tests. Historical N500 unledgered schedule and coverage limits stay explicit.
- New source-only follow-ups: `MANUAL-GATE-001` and `MANUAL-INV-001`.
  See the current test register. No fix or live reproduction is claimed.

## Exact Implementation Pointers

- Access: `artifacts/api-server/src/lib/access-policy.ts` and `authorization.ts`.
- Workflow: `artifacts/api-server/src/lib/workflow-readiness.ts` and
  `artifacts/api-server/src/routes/containers.ts`.
- Invoice: `artifacts/api-server/src/routes/invoices.ts` and
  `artifacts/cost-analysis/src/components/invoices/CreateInvoiceDialog.tsx`.
- Report specification: `docs/REPORT_CENTRE_SPECIFICATION.md`.
- Navigation: `artifacts/cost-analysis/src/App.tsx`.
- Deployment: repository `package.json` and `railway.toml`.
