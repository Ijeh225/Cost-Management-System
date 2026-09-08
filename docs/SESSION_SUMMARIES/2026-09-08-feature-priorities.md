# Feature Priorities Discussion - 2026-09-08

## 2026-09-08 14:57 WAT (UTC+01:00) - Proposed Next Investments

- User asked which features to add or improve after closing the three REVIEW
  fixes. Checked current PROJECT_STATE and the capability review; no old defect
  is reopened and no implementation is authorized by this discussion.
- Preserve CAP-01 through CAP-16 identifiers from the existing review, rather
  than inventing a replacement set of audit steps or claiming missing modules.
- Recommended first product improvements: CAP-01 unified job overview/personal
  work queue, CAP-02 document readiness and version/expiry checks, CAP-03 free-time
  and delay-cost forecasts. Start document classification/checklists before OCR.
- Next operational/financial priorities: CAP-14 searchable report centre and saved
  views, CAP-07 independent bank-statement matching/close controls, CAP-08 credit
  and collection follow-up, CAP-06 quotations/accepted commercial versions.
- Customer/field expansion: CAP-05 private client portal, CAP-09 dispatch and proof
  of delivery, CAP-10 broader tracking and milestone communications. Existing
  Maersk tracking, WhatsApp, invoices and delivery fields are not absent modules.
- CAP-15 privileged MFA, recovery and tested restores should run alongside product
  work before wider access/rollout. Existing authentication/backups remain.
- Foundation decision: confirm whether one B/L routinely covers multiple
  containers or equipment returns on later jobs. If yes, prioritize CAP-04
  additive shipment/container-visit model before dependent expansion.
- If the business operates the physical bonded yard, CAP-12 locations/occupancy,
  movement orders, inspections and truck appointments becomes an early priority;
  gate-in/out alone is not yard inventory. If it only clears through other yards,
  defer this module and focus on visibility. Business scope remains unconfirmed.
- Later conditional work remains CAP-11 supplier bills, CAP-13 reviewed customs
  references/estimates, CAP-16 accounting/FX integrations and other freight types.
- Rechecked official Magaya Digital Freight Portal and Kaleris Terminal Operations
  pages for customer-portal and physical-yard examples. Vendor descriptions are
  reference capabilities, not evidence of defects or installed integrations.
  Sources: https://www.magaya.com/digital-freight-portal/ and
  https://kaleris.com/solutions/terminal-operating-system/.
- No application source, live data, configuration or schema changed. Next action:
  user selects a feature and confirms relevant scope; then define acceptance,
  test in isolation, deploy and perform bounded live acceptance. Do not implement
  all proposals at once or describe them as already approved.

- Publication: discussion records committed and pushed as b76aab0. This follow-up
  records the confirmed Git result; product proposals remain unapproved.
