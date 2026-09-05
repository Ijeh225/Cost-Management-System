# 01 | How to Use This Manual
This is the operating blueprint and training reference for the COST container-clearing and cost-management application used by Don Climax. It explains what a record means, who is responsible for it, how to perform the main tasks, and how to verify that related modules agree.

## Document Control
| Item | Controlled value |
| --- | --- |
| Edition and review date | Edition 1.0, 5 September 2026 |
| Source baseline | Git master at 8d62f2c; documentation prepared after that baseline |
| Recorded deployed release | 6a327a5, including API-ROUTE-001 correction 05ba101; deployment confirmed in the continuity records |
| Current inspection | Authenticated read-only screen captures on 5 September 2026; no financial or workflow writes for this manual |
| Intended readers | Owner, administrators, department staff, accounts staff, supervisors, support engineers and trainers |
| Review trigger | Any change to a workflow, permission, financial rule, report, integration or confirmed defect |

## Read in the Right Order
New staff should read chapters 02-04 and 08-12 first, then the chapters for their assigned department. Accounts staff should additionally read chapters 26-42. Administrators and support engineers should also read setup, controls and the evidence appendices. Chapters 44-46 provide one connected training example.

**Procedure** describes the intended operating steps. **Control** describes a source-supported restriction unless explicitly described as an operating policy. **Verified** refers to the specific evidence recorded in the live-test register, not a promise that every possible case was tested. **Recommendation** is management guidance, not an implemented automatic feature.

> Screenshots show existing test data and the owner's broader navigation. Your menu may be smaller. Example names and figures are illustrations, not instructions to create duplicate records or evidence of current company balances.

Older failed test rows are retained for audit. The latest authoritative closure sections take precedence over their original status. Source references S1-S14 are mapped in chapter 52.

# 02 | Purpose and System Boundaries
The application coordinates container-clearing work and its associated money records. A single job can be inspected operationally, billed to a client, linked to supporting documents, paid through several expense channels and followed through delivery and empty return. The system helps staff answer: what is the job, where is it, who must act next, what is owed, what has actually been paid, and which records support the answer?

## Four Connected Views
| View | Main records | Question answered |
| --- | --- | --- |
| Operational | Containers, departmental milestones, gate and delivery events | What has actually happened to the job? |
| Commercial | Clients, clearing charges, invoices, credit and receivables | What is the client being charged and what remains collectible? |
| Financial | Dated collections, duty payments, disbursements, overhead and bank entries | Which money movements have been recorded? |
| Control | Branch access, approvals, tasks, alerts, audit evidence and reports | Who may act, what needs review and why do totals differ? |

## What It Does Not Automatically Prove
A saved expected release date does not prove a release occurred. An approved schedule is not a payment. A job marked Closed is not proof of physical delivery, empty return or client settlement. A generated invoice is not proof that an email reached a customer. An AI answer is not a substitute for its source records.

The Financial Ledger is a source-linked record of money movements. Do not describe it as a complete statutory double-entry general ledger, a tax certification service or an external bank execution platform. Recording a bank payment records the transaction in this application; staff must separately verify the real-world payment evidence when real business data is introduced.

The application is not the customs authority. Documentation, assessment, release and gate confirmations must reflect authentic external events and approved documents. It does not replace those documents merely by changing a status.

Basis: S1-S5, S8-S11.

# 03 | Application Architecture
!DIAGRAM(architecture)

The browser presents forms, workspaces, dashboards and printable reports. The authenticated API validates requests, applies branch and capability rules, and reads or changes PostgreSQL records. Files use private object storage and application-controlled retrieval. Optional service connections support AI interpretation, email and WhatsApp.

## Ownership of Information
- The container is the operational anchor: branch, client, identifiers, status, officers, departmental dates and linked evidence.
- Invoices own billing lines and collection history. Payments and reversals retain their own dates and references.
- Banks own account identity and opening balance; their displayed activity is assembled from the underlying sources.
- Reports calculate from selected source records. Exporting a report does not post new money.
- Authentication and permissions apply at the backend as well as the page navigation.

> A page may be visible while a particular action is forbidden. Likewise, changing a URL must not bypass branch or finance controls. API-ROUTE-001 corrected the opposite problem: finance guards were incorrectly blocking unrelated staff routes.

Technical layout: React/TypeScript/Vite frontend, Express/TypeScript API, Drizzle/PostgreSQL data layer and shared generated contracts. See chapter 50 for deployment and chapter 52 for source locations.

# 04 | How Records Move Between Modules
!DIAGRAM(money)

## Follow the Source, Not Only the Total
A client links to containers and invoices. A container's charge sections describe the planned commercial and cost position. Actual disbursements and duty payments create dated evidence. An issued invoice creates the eligible billing position; recording its collection creates a cash receipt. Overhead payments are separate from job-specific charges.

The same transaction may appear in its source module, a bank view, Financial Ledger and Cash Flow. These are views of one event, not separate amounts to add together. Internal bank transfers have two account sides but are eliminated from consolidated cash flow.

P&L recognition is different: the current actual-cost model associates a container's signed costs with its first active invoice date. Therefore a payment-date Cash Flow and an invoice-recognition P&L need not have identical period totals. Chapter 39 explains the reconciliation procedure.

Basis: S8-S11. The diagram distinguishes implemented record flows from any proposed future accounting system.

# 05 | First Installation and Owner Setup
This chapter is for a genuinely new environment. The existing application already has an owner and branches. Do not rerun bootstrap, replace the database or remove users to follow a training exercise.

## Technical Preparation
1. Have the technical administrator provision the application service, PostgreSQL and private document storage in the intended environment. Configure secrets securely; never place credentials in the manual, Git or screenshots.
2. Use the repository's pinned package manager and build commands. Confirm database access, application health and HTTPS before inviting staff. The Railway sequence is detailed in chapter 50.
3. Open the new application. If First-Time Setup is available, enter the owner name, email, password and matching confirmation.
4. The current setup form requires at least eight password characters, including lowercase, uppercase and a number. Use a unique stronger password and approved password storage.
5. Submit once, wait for confirmation, and verify the new administrator identity. Once setup is complete, users are created through User Management, not through bootstrap again.

## Business Setup Order
| Order | Prepare | Verify before continuing |
| --- | --- | --- |
| 1 | Branches and contact details | Correct names, active status and ownership |
| 2 | User authority, job function and workspaces | Least privilege and the correct branch |
| 3 | Verification and berthing assignments | Actual responsible officers selected |
| 4 | Clients and clearing-rate information | No duplicate client and correct branch |
| 5 | Bank accounts and opening balances | Agreed opening date/balance and source evidence |
| 6 | Operational alerts, document storage and communications | Controlled test before external use |

> Recommended go-live control: distinguish training records from real opening balances, review retained test data explicitly, and obtain management sign-off before real transactions begin. This manual does not authorize data deletion.

Basis: S6, S7, S12.

# 06 | System and Branch Configuration
**System Settings** is a controlled administration area, not a daily data-entry page. Review the active tab, change one logical group at a time, save, and reopen to confirm persistence. Keep an audit note explaining material threshold or permission changes.

## Configuration Areas
| Area | What to configure | Operating caution |
| --- | --- | --- |
| Assigned officers | Users responsible for verification and berthing | Authority alone does not replace officer assignment |
| Deadlines and alerts | Before-due reminders, inactive-job threshold and department timing | Threshold changes alter who appears overdue |
| Email and WhatsApp | Enablement, recipients, sender details, category preferences and digest timing | Saving settings is not proof of external delivery |
| General and other settings | Available application controls and defaults | Do not change unfamiliar controls without a documented purpose |
| AI governance | Provider switch, rollout access, scope, evaluation and cost settings | Some descriptive settings text refers to proposed/future behavior; do not infer every policy is enforced |

## Branch Settings Procedure
1. Select the intended branch or open its settings with an authorized account.
2. Maintain location, contact email and phone. Confirm the branch identity before saving.
3. Select the supported sender configuration for email and WhatsApp. Where branch-specific sender details are used, enter the authorized From, Reply-To or number as applicable.
4. Configure the branch alert number and included alert types deliberately.
5. Save and reopen. If an actual test message is required, use an approved dummy recipient and record the delivery result separately.

Report Centre subscriptions use fixed **Africa/Lagos** scheduling. Other system email controls may display **server time**. Read the label for the exact scheduler; do not assume they all use the same time basis.

Secrets such as storage keys, Resend credentials and Meta credentials belong in the deployment environment. Ordinary staff must not be given those secrets to resolve a missing menu or access error.

Basis: S6, S12. Communication-provider delivery is a configuration-dependent capability, not a universal live-test pass.

# 07 | Branches and Branch Scope
A branch determines record ownership and visibility. It is not merely a display filter. A user can have the right department but still be unable to open another branch's record.

## Create and Maintain a Branch
1. As the Owner/Super Admin, open **Branches** under administration and choose the branch-creation action.
2. Enter a clear unique business name and the requested contact/location fields. Save and confirm the new branch in the list.
3. Configure branch contact and notification settings, then assign users to that branch.
4. Create clients and banks for the correct branch before entering dependent financial records.
5. When editing or deactivating a branch, consider its users and historical records. Inactive-branch access is restricted for non-Super-Admin users; deactivation is not a cleanup shortcut.

## All Branches Versus One Branch
The Super Admin can use All Branches for a consolidated view. A creation form still needs an explicit destination branch when the scope does not identify one. BRN-001 corrected rejection of valid selected-branch creation from All Branches. Related records must still belong to the same permitted branch.

Example: a Lagos invoice must not select an Abuja bank simply because the owner is viewing All Branches. Select Lagos, its client/containers and a Lagos payment source, then inspect the resulting record under Lagos and confirm that Abuja totals did not change.

## Before Comparing Figures
- Match branch scope on both screens.
- Match date range, cost basis, invoice eligibility and payment status.
- Do not add a consolidated total to its branch components.
- Treat an other-branch 404 as an intentional privacy boundary, not proof that the record was deleted.

> Recommended daily check: include branch name in exported filenames and review headers before sending reports. Exports can contain client and financial information even when the current exercise uses only dummy data.

Basis: S1-S3, S5-S7.

# 08 | Authority, Function and Workspace
The current access model separates **authority level**, **job function**, **workspace selection** and **branch scope**. Older role names may exist in history or compatibility fields, but those labels are not the authoritative permission model.

## Authority Levels
| Authority | Main responsibility |
| --- | --- |
| Super Admin / Owner | System configuration, authority management, all-branch oversight and overall control |
| Administrator | Administrative oversight within permitted scope; does not automatically become an all-branch owner |
| Branch Admin | Branch oversight and permitted branch-member management; cannot grant peer/higher authority |
| Staff | Assigned function and workspace work; no general administrator or finance entitlement |

## Staff Functions
| Function | Workspace relationship |
| --- | --- |
| General Staff | No automatic specialist workspace |
| Documentation | Documentation workspace |
| Accounts | Accounts workspace and finance capability, subject to action-specific controls |
| Operations | One or more explicitly selected Transire, Shipping, Terminal/TDO and Pull-Out workspaces |
| Terminal Manager | Physical terminal supervision: Gate-In, Examination and Final Release |
| Delivery / Transport | Delivery workspace |
| Security | Gate Security workspace |

An Operations user with Shipping access does not automatically gain Transire or Terminal access. A stage owner is an accountability assignment on that stage; typing a name there does not grant login permissions or change a user's workspaces.

> The three similar terms are different: Terminal/TDO is an early operational release desk; Terminal Manager supervises physical terminal stages; Security records gate events. Do not combine them into a legacy Shipping & Terminal role.

Basis: S5. Use the current access profile, not historical role-badge screenshots, when granting access.

# 09 | Permission and Responsibility Matrix
This is a practical capability guide. Exact requests remain subject to branch checks, account status, officer assignments and endpoint-specific authority. It is intentionally not a promise that every person who can view finance can approve or reverse it.

| Task family | Normal responsible group | Important restriction |
| --- | --- | --- |
| System settings and authority levels | Super Admin | Never delegate through a department label |
| Branch user maintenance | Branch Admin or higher | Branch Admin manages Staff within scope, not self-escalation or higher authority |
| General permitted record reads | Valid active access profile | Branch visibility still applies |
| Verification and berthing | Assigned officers | Officer assignment checked separately, including for administrators |
| Documentation | Documentation or permitted admin | Own workspace and branch |
| Transire / Shipping / TDO / Pull-Out | Explicit Operations workspace selections | Each department keeps independent milestone fields |
| Physical terminal supervision | Terminal Manager or permitted admin | Downstream readiness is separate from TDO completion |
| Delivery | Delivery or permitted admin | Actual delivery evidence must be recorded |
| Gate events | Security or permitted admin | Physical event procedure and exact route controls apply |
| Finance screens | Accounts or Branch Admin and higher | Some management/posting/reversal routes require Branch Admin or higher |
| Branch comparison | Super Admin | Consolidated cross-branch information |
| AI Assistant | Authorized Admin/Super Admin under rollout policy | Governed tools, scope and confirmation boundaries |

## When Access Is Denied
Check the logged-in identity, active branch, authority, job function and selected workspaces. Do not solve a denied operation by giving everyone Super Admin. Ask the responsible administrator to correct only the missing assignment. A finance request returning 403 for non-finance staff is expected protection.

The final API-ROUTE-001 acceptance used a controlled Operations staff account. Permitted same-branch operational reads succeeded, other-branch records returned 404 and finance requests returned 403. That is the intended separation, not a broken menu.

Basis: S1-S3, S5. This matrix describes the reviewed baseline, not a newly re-tested full role/device matrix.

# 10 | Create, Change and Disable Users
## Add a User
1. Open **User Management** and choose **Add User** with an authorized administrator account.
2. Enter the person's name, email, initial password and branch as requested. Use a real unique staff identity for real operation; use clearly labeled dummy identities only in controlled testing.
3. Select the appropriate authority level. For Staff, choose the job function and, for Operations, the exact workspaces required.
4. Review the resulting access summary. Confirm that unrelated finance, other branches and extra departments are not being granted.
5. Save once. Wait for the success response, then verify the new list row and reopen Edit to confirm persistence.
6. Test a fresh login in an independent session. Confirm both an allowed task and a prohibited area. A working owner session does not verify staff access.

## Change Access or Reset a Password
Use Edit, make the smallest necessary change, save and recheck the profile. Verify a fresh login after material changes because existing browser state can be stale. Passwords must never be stored in project summaries, exported manuals or audit screenshots. Branch Admin restrictions prevent inappropriate authority changes and self-management shortcuts.

## Disable Instead of Destroying History
Deactivate a user who should no longer sign in, while preserving references to their recorded actions. Do not delete an account merely to remove its name from old payments, approvals or stage history. Existing audit attribution is part of the evidence trail.

The historical SEC-002 cleanup disabled unexpected legacy/test accounts rather than destroying their audit history. Later deliberately authorized QA accounts are a separate testing decision. Do not infer today's active-account inventory from that old cleanup screenshot.

**Historical correction:** the Add User dialog once crashed because form components were rendered without their required form context. That was a corrected UI defect, not a reason to modify database records manually. If the same message reappears, record the deployed release, exact action and screenshot for support.

> Recommended control: periodically review active accounts, branch membership and workspace selections. General Staff should not be treated as a fallback finance role. Never share the owner's credentials as a standard operating arrangement.

Basis: S1-S3, S5-S7.

# 11 | Navigation and Daily Orientation
!SCREEN(dashboard|Figure 1. Live Operations Dashboard, captured 5 September 2026. Test figures are a dated screenshot, not opening balances or current business facts.)

The sidebar groups daily operations and administration. The branch selector determines scope. The header contains search, notifications and profile controls. On a smaller screen, open the sidebar using its toggle rather than assuming a missing menu means missing permission.

## Start-of-Day Routine
1. Confirm your identity and branch.
2. Open your department workspace or My Tasks and identify assigned, due and delayed work.
3. Read notifications and follow the source record before acting.
4. Check expected dates, missing documents and actual release evidence.
5. At the end of the day, save current actions and hand over unresolved items with an owner and due date.

Operational estimates and Financial View are separate. Never take the largest number on the Dashboard as cash in the bank. See chapter 37 before using Dashboard figures for financial decisions.

# 12 | Clients and Commercial Information
The client record links customer identity, containers, invoices and balances. It is the starting point for reliable billing and statements. Operational users may see client names on authorized jobs without receiving access to the full finance-oriented Clients module.

## Create or Update a Client
1. Open **Clients**, search by the customer's existing name and inspect possible duplicates.
2. Choose the creation action only if no suitable record exists. Enter the requested customer identity, contact details and correct branch.
3. Maintain the agreed clearing rate where applicable. Confirm whether that rate is intended for the container type and commercial agreement; the application does not independently negotiate it.
4. Save and reopen the client. Link jobs to the saved client record rather than repeatedly entering similar free-text names.
5. Review contact details before sending statements, invoices or reminders.

## Use the Client Detail Page
Inspect linked containers, invoices, payments and available wallet/credit information. When a balance looks wrong, open the contributing invoices instead of changing a summary value. CLT-001 and STMT-001 corrections aligned eligible invoice populations with Accounts Receivable.

An unallocated deposit is money received but not yet allocated to an invoice. It is not new invoice revenue. A credit balance can arise from a legitimate credit or historical overpayment and must be explained by its source. Apply it through the controlled credit procedure; do not also record it as a new bank receipt.

## Client Statement Request
Open Reports, choose the client, select the relevant date range and generate the statement. Verify opening balance, period invoices, collections/corrections and closing balance. Cancelled, draft and written-off invoices must not inflate current collectible totals. Where historical audit rows remain visible, read their exclusion label.

> Recommended data standard: one agreed spelling per customer, accurate phone/email details, and documented branch ownership. Updating a contact is different from transferring all of that client's financial records to another branch.

Basis: S7-S11.

# 13 | Register a New Job or Container
The container record is the central job file. Before creating one, collect the B/L, container identifier, customer, vessel, container size/type, command/location and available arrival information. Do not confuse the database record ID with the physical container number.

## Entry Procedure
1. Open **Containers** and search the container number and B/L. Inspect existing matches before choosing New/Add Container.
2. Select the correct branch and linked client. Complete the required identifiers and descriptive fields exactly from the supporting documents.
3. Enter expected arrival information as an estimate. Actual berthing is a separately confirmed event.
4. Enter clearing charges and charge-section information only when authorized and supported. Initial budget figures are not actual payment entries.
5. Select or confirm responsible verification/berthing officers through the supported assignment controls.
6. Save once and open the new record. Verify the branch, client, identifiers, status and pending-verification position.
7. Add the supporting documents and hand the record to the assigned officer. Confirm it is discoverable in the relevant operational view.

## Container Detail Versus Operations Detail
Container Detail brings together master information, charge sections, documents and finance links. Operations Detail focuses on progress, dates, independent stage control and history. They refer to the same job; creating a second container to obtain another department's screen breaks traceability.

Pending Verification is an intake control, while Registered is a pipeline status. Do not assume a Registered label alone proves the officer's verification is complete. The early department workspaces rely on the verified-job population.

> Checkpoint: record the visible container identifier and saved record link in the handover. Do not create duplicate jobs because a page is still loading or a filter is hiding the original.

Basis: S4, S6-S7.

# 14 | Batch Upload and Duplicate Review
**Upload Data** imports container records from CSV or Excel. It is not the same as uploading a PDF document to a job, and it does not replace verification or create authentic payment evidence from an estimate.

## Controlled Import Procedure
1. Open Upload Data and download the current template. Use its exact column headers rather than an older spreadsheet remembered from a previous version.
2. Prepare a small, reviewed file with correct identifiers, branch/client information and supported values. The current interface supports CSV and Excel and displays a 10 MB limit.
3. Select the file and wait for parsing and duplicate checking to finish.
4. Read the preview, invalid rows and duplicate conflicts. Existing or repeated rows are skipped by default.
5. Investigate every conflict. The interface has an explicit import-anyway selection, but that is not permission to duplicate a real job without a documented reason.
6. Confirm the number of approved rows and import once. Read the created/skipped/error result, then inspect a sample of the saved records.
7. Reconcile the actual created count to the approved preview and keep the reviewed source file under the organization's retention policy.

## When Duplicate Checking Is Unavailable
The interface can warn that existing records could not be flagged and that database constraints will catch conflicts. Do not interpret this as a clean duplicate check. Recommended procedure is to stop and investigate or reduce to a deliberately controlled small import.

## After Import
New job records still need correct officer verification, document linkage and departmental milestones. A spreadsheet date must not be treated as proof of actual release without its underlying evidence. Revisit branch totals to ensure the import affected only the selected branch.

> Never use bulk import to reconstruct historical financial ledger rows from a running balance. A payment needs an authentic date, amount, source and reference, not simply a total copied from a legacy sheet.

Basis: S7; import coverage is not a claim that every possible spreadsheet shape was live tested.

# 15 | Verification and Actual Berthing
Verification protects the identity and accuracy of the job before departmental work proceeds. Actual berthing records an arrival event. Both require the assigned officer; a broad authority level does not substitute for the assignment.

## Verify a Container
1. The assigned officer opens the pending job in the available verification/intake view.
2. Compare the container number, B/L, customer, size/type, vessel and location/command against the supplied evidence.
3. Correct permitted input errors through the normal form, or return the record for correction. Never confirm simply to make it appear in another queue.
4. Use the verification action once the information is correct. Wait for confirmation and reopen the job to verify the persisted state.
5. Check that the relevant early department workspace can now see the job.

## Confirm Berthing
The assigned berthing officer records the actual event through the berthing control when the vessel/container arrival is confirmed. Expected arrival remains planning information. A change to ETA must not be substituted for the actual berthing action.

## Evidence and Exceptions
Keep the supporting arrival/verification document, officer identity and recorded timestamp. If the action returns 403, verify officer assignment and branch before requesting a code change. If a record is inaccessible from another branch, that is an expected scope restriction.

The isolated integration suite tested assigned-officer verification/berthing and cross-branch restrictions. The latest non-finance live acceptance tested permitted reads and denied finance routes; it did not repeat officer writes. These are different evidence levels.

> Recommended handoff: state who verified the job, what documents were checked, the actual arrival position, and which department is expected to act next. Verification does not mean duty is paid, documents are complete or a release has occurred.

Basis: S1-S3, S5-S6.

# 16 | The Complete Operational Map
!DIAGRAM(workflow)

The main pipeline names are Registered, Documentation, Duty Assessment, Duty Payment, Transire Processing, Shipping, Terminal, Pull-Out, Gate-In, Examination, Final Release, Delivery and Closed. Empty return is tracked through delivery/custody and gate fields rather than as a separate main pipeline status.

Early departmental activity can run in parallel after verification. Each desk records its own evidence even while the job's broad pipeline label remains elsewhere. Before downstream transitions, the readiness rule requires the PAAR number and release date plus Transire, DO, TDO and Pull-Out release evidence.

> The diagram is the operating sequence. The source review identified weaker checks in individual gate-event handlers than in the main transition path; follow the full procedure and read the limitation in chapter 49. Do not use a permissive gate button as authority to skip releases.

Basis: S4-S6.

# 17 | Documentation and Duty Assessment
## Documentation Desk
1. Open **Documentation** or its workspace link and find the verified job by container number or B/L.
2. Review the document checklist and existing uploads. Record the documentation-stage owner independently of other departments.
3. Complete available documentation fields and the next required action. Use a due date and delay reason when evidence is missing.
4. Enter the PAAR information when authentic evidence is available. The PAAR number controls the Documentation submitted population; downstream readiness also requires its actual release date.
5. Save and verify the job's active/submitted view, uploaded files and recorded dates after reopening.

## Assessment
Record the customs assessment and duty liability in the corresponding job/assessment fields using the assessment document. Duty Assessment describes what is assessed; Duty Payment describes money actually recorded against it. Confirm currency and figures before handing off to Accounts.

Do not overwrite assessed liability with the paid amount to make outstanding duty disappear. The Duty Payments module and Duty Ledger must provide the actual payment evidence. Use Duty Reconciliation to identify historical snapshot amounts with no ledger record.

## Document Handling
Upload to the specific job using the supported attachment control. Give the document a meaningful title/type. After upload, confirm its link opens from the job before asking AI to retrieve it. Searchable content depends on indexing/extraction, not merely the existence of a file.

> Example: PAAR is awaited. Keep Documentation active, assign the correct documentation officer, enter the next action and expected date, and record the delay. Do not mark PAAR released or advance downstream solely because a PDF with a similar filename exists.

The live testing corrected AI's failure to locate job documents and its citation routing. A final direct-download browser limitation remains distinguished from a confirmed application defect.

Basis: S1-S4, S6-S7, S13.

# 18 | Independent Department Stage Control
Stage Control makes each department accountable for its part of the job. It is not a duplicate user-permission screen. Each stage keeps its own owner, expected date, actual release information, next action and relevant delay details.

## The Save-versus-Release Rule
| Control | Meaning | What it must not imply |
| --- | --- | --- |
| Stage Owner | Person responsible for this department's work | Access to another department or global user reassignment |
| Expected date | Planned completion date | Actual completion or a payment date |
| Next Action / due date | What must happen next and when | An automatically completed task |
| Delay Reason | Explanation for a missed or threatened deadline | Permission to bypass readiness |
| Save | Persist the entered stage information | Mark the stage released |
| Mark Released | Confirm the actual stage completion | Complete every other department |

## Daily Procedure
1. Expand the correct job in your own workspace.
2. Check the department title before changing the owner. Transire's owner must not populate Shipping or Terminal/TDO.
3. Save the expected date and relevant control fields. Reopen to confirm persistence.
4. Only when the actual release is confirmed, use the department's release action. Supply an actual date where the form supports one; otherwise the action records its timestamp.
5. Inspect the Submitted/Released tab and the audit/history evidence.

The original shared-owner problem was corrected. OPS-001 and AI-002 re-tests confirmed authoritative department-stage ownership in operational views and AI answers. Duplicate release attempts are protected on the department action path; do not repeatedly click because the page is slow.

> A generic legacy stage-owner field may remain in historical data. Current department owners are the authority for departmental accountability. A single name appearing in different departments is legitimate only when it was deliberately assigned in each one.

Basis: S1-S6.

# 19 | Transire and Shipping Desks
## Transire Procedure
1. Open **Workspace Access > Transire** and locate the verified job.
2. Confirm Transire's own stage owner, supporting information and outstanding requirements.
3. Enter **Expected Transire Release Date** and save. The job remains Active.
4. When release is authentic, use **Mark Transire Released**. Confirm the Actual Transire Release Date and the Submitted/Released population after refresh.
5. Review the history for one attributable completion and notify the next responsible department through the normal handoff.

## Shipping Procedure
1. Open **Workspace Access > Shipping**, not the physical Terminal Manager workspace.
2. Assign Shipping's own owner and inspect the shipping/Delivery Order evidence for the same job.
3. Enter **Expected DO Release Date** and save without completing the stage.
4. Use **Mark DO Released** only after the Delivery Order release is confirmed.
5. Confirm Actual DO Release Date and the Released tab. Transire's fields must remain unchanged.

## Interpretation
Transire Processing and Shipping may both have work on the same verified job; their active counts are department workload, not necessarily the single current pipeline status. An Active Shipping job is not proof that it is physically inside a terminal. A Released Shipping job has DO evidence, not automatic TDO, Pull-Out or delivery completion.

## Handoff Checklist
- Correct container/B/L and branch.
- Independent owner and expected date saved.
- Supporting release evidence linked to the job.
- Actual release date checked after reopening.
- Missing requirements and delay reasons passed to the next responsible person.

> Never use a planned date merely to clear a queue. Where a date is wrong, request the authorized correction with evidence; do not create a replacement container or repeat release actions to hide the mistake.

Basis: S4-S7.

# 20 | Terminal / TDO and Pull-Out
!SCREEN(terminal|Figure 2. Terminal/TDO operational workspace. This desk is different from the physical Terminal Manager workspace.)

## Terminal / TDO
Open **Workspace Access > Terminal** at the Terminal/TDO desk. Find the job, assign that department's own owner, save **Expected TDO Release Date**, and confirm **Mark TDO Released** only when supported. Verify the actual date and Released list independently of Transire and Shipping.

## Pull-Out
Pull-Out becomes available after TDO release. Open its workspace, inspect the prerequisite, set its owner and expected date, and record the actual Pull-Out release using the stage action. OPS-002 corrected visibility of the Released view; always verify both Active and Released filters before assuming a job disappeared.

TDO release alone is not physical Gate-In. Pull-Out release alone is not customer delivery. The later readiness check still considers PAAR, Transire, DO, TDO and Pull-Out evidence together.

Basis: S1-S7.

# 21 | Physical Terminal: Gate-In to Release
The **Terminal Manager** workspace supervises the physical terminal stages, not the early TDO desk. It handles jobs progressing through Gate-In, Examination and Final Release.

## Procedure
1. Inspect the job's prerequisite release evidence. The main downstream transition path requires PAAR number/date, Transire release, DO release, TDO release and Pull-Out release.
2. Confirm physical arrival through the authorized Gate-In process. Check the job identity and location before recording a timestamp.
3. In the Terminal Manager workspace, open the relevant Gate-In/Examination stage, record its available details and submit only after the real activity is complete.
4. Record Examination outcomes and unresolved requirements in the proper fields and notes. A blank field is not an automatic pass.
5. At Final Release, use the expected release date for planning and the actual confirmation for completion. Keep the responsible owner and delay information accurate.
6. Hand the job to delivery/transport and Security for the applicable loaded Gate-Out event. Do not infer Gate-Out from a status label alone.

## Status and Physical Presence
The physical-terminal Dashboard measure is based on the physical terminal stages, excluding jobs already gated out. It is not the number of all jobs with TDO work, or the total registered container population. This distinction corrected earlier misleading AI and dashboard interpretations.

## Controls
Administrators have broader transition powers, but normal staff should follow their designated stage responsibilities. A permitted status change is not authority to invent the underlying customs or physical event. Full-container approval has its own readiness checks and does not replace the final delivery/empty-return checklist.

> Record dates when the events occur. If a control permits an unexpected jump, stop and record the issue rather than using the shortcut. Chapter 49 identifies the gate-route source-review gap without claiming a new live failure.

Basis: S4-S7, S10.

# 22 | Security: Loaded and Empty Gate Events
!SCREEN(gate|Figure 3. Gate Security landing page. Search for the exact container before recording an event; the empty list in this capture is not a system-wide proof of no movements.)

## The Four Events
**Gate-In** records loaded entry. **Gate-Out** records loaded departure. **Empty Gate-In** records the empty container's return to the terminal where that custody scenario applies. **Empty Gate-Out** records its departure toward the port and sets the empty-return date in the current implementation.

Search the exact container, inspect its branch, identifiers, physical status and existing timestamps, then choose the real event once. Reopen the record and inspect the Gate Log. Export CSV where needed for shift handover.

Empty Gate-Out requires Empty Gate-In. Repeated Gate-Out and empty-event submissions are rejected when already recorded. Gate-In has a weaker duplicate check in the reviewed handler; operators must not click it again to refresh a timestamp. Loaded and empty movement controls do not replace release evidence.

> Recommended shift control: compare gate records to physical gate documentation. Never use an event button as a test on a real movement. Source-review follow-up MANUAL-GATE-001 is documented in chapter 49.

Basis: S6-S7. No gate event was recorded during this manual's screenshot capture.

# 23 | Delivery, Empty Return and Completion
Delivery records the physical completion of transport to the customer. Empty return closes the applicable custody cycle. Administrative job closure and client payment settlement remain separate checks.

## Delivery Procedure
1. Open **Delivery / Transport** with the authorized workspace profile and find the released job.
2. Review the destination, transporter/truck/driver information and available delivery fields. Check release and gate evidence before dispatch.
3. Save planning information in the appropriate fields. Do not set actual delivery to the expected delivery date merely to avoid an overdue alert.
4. When delivery is confirmed, record the actual delivered date and applicable status/details in the delivery editor.
5. Save, reopen, and compare the persisted date with **Delivery Tracking Report** using a range that includes that date.
6. Check the Dashboard Completed count in the same branch. It follows actual delivery evidence, not just the Closed status.

## Empty Return and Custody
Record empty return using the supported delivery/custody fields and, where applicable, the Empty Gate-In/Empty Gate-Out sequence. Empty Gate-Out automatically sets the return date on that path. Do not record both paths as two separate physical returns. Preserve the supporting receipt or return evidence.

## Close-Out Checklist
- Required department releases and final-release evidence are present.
- Actual delivery date is saved and reconciles to Delivery Tracking.
- Empty-return/custody position is resolved or explicitly documented.
- Job documents and approval history are complete.
- Invoice and outstanding client position have been reviewed by Accounts.
- Duty, disbursements, overhead allocations and remaining schedules are explained.
- An authorized person completes the administrative closure procedure.

DEL-001 fixed delivery-date persistence and reconciliation with Dashboard/Delivery Tracking. A Closed job can still have an unpaid invoice. Do not mark an invoice Paid just because the job is operationally finished.

Basis: S1-S3, S6-S11.

# 24 | Approvals, Tasks and Workflow History
## Approval Queue
Open **Approval Queue** as an authorized administrator. Select the pending request, inspect its source job or payment schedule, compare the amount/details and supporting evidence, and approve or reject with a meaningful reason. Wait for completion and check the queue immediately; APR-001 corrected the need to reload after rejection.

Approval is authorization to proceed, not proof of payment. A rejected item must not still be used as an approved spending instruction. If two people are reviewing the same item, recheck its current state before submitting a second decision.

## My Tasks
Use **My Tasks** as an assigned work queue, not a second general container list. Open the source job, inspect your assignment, due date and next action, and update the supported task state when work is actually complete. TASK-001 corrected the broad unassigned-list behavior. Tasks, stage ownership and global access are related but distinct concepts.

## Pipeline Board and Operations
The Pipeline Board gives an administrator a stage overview; Operations provides job-level progress. Stage-owner and date information should agree with the department's own controls. A job can have parallel early departmental work even when the board shows one broad pipeline column.

## History and Notes
Add explanatory notes where decisions or delays need context. Do not use notes to replace structured actual dates, a payment row or a formal approval. Inspect recorded user, timestamp, event type and source before concluding that two history rows mean two payments.

NOTIF-002 corrected duplicate Payment Scheduled and Payment Approved event creation at its source. The expected history is one applicable event per recipient/user for one transition, not accidental duplicate event generation. Records across separate recipients are not automatically duplicates.

> Recommended handover format: container/B/L, current stage, assigned owner, completed evidence, next action, due date and unresolved blocker. This creates a usable handover without duplicating a financial transaction.

Basis: S1-S7, S9.

# 25 | Job Charges, Costs and Currency
Charge sections capture the job's planned cost and commercial information. Actual payment modules capture money movement. This separation is essential to a reliable budget-versus-actual comparison.

## Enter and Review Charges
1. Open the correct container and inspect its available charge sections.
2. Enter the supported item descriptions and amounts from the approved estimate or source document. Confirm whether the field is a cost, clearing charge or other commercial value.
3. Where a foreign-currency field is supported, enter the original amount and the intended conversion rate. Review the resulting NGN amount before saving.
4. Save and inspect the section total and overall container totals.
5. Submit the section/job for approval where the workflow requires it. Do not assume that a saved number is an approved amount.

## From Budget to Payment
When money is actually paid, use **Container Payments** for job disbursements, **Duty Payments** for customs duty, or **Overhead Expenses** for company overhead. Do not record the same duty transaction again as a container disbursement. Planned charges alone must not appear as cash outflow.

| Term | Correct interpretation |
| --- | --- |
| Clearing charges | Commercial/budgeted client charge on the container, not automatically issued invoice revenue |
| Budgeted cost | Planned cost used by operational profitability and variance reports |
| Actual paid cost | Supported dated payment rows, net of valid reversal rows |
| FX rate history | Rates recorded with supported charge entries, not a claim of automatic market pricing |
| Variance | Difference between selected budget and actual spend, under the report's date and scope rules |

> Example: a Shipping budget of NGN 150,000 and a recorded payment of NGN 100,000 mean NGN 50,000 remains against that budget. They do not mean NGN 250,000 was spent. Check whether the budget changed before interpreting the variance.

Basis: S4, S7-S11.

# 26 | Create and Issue an Invoice
## Before Creating
Confirm the client, branch, linked containers and agreed commercial amount. Search existing invoices so that a delay or filter does not cause duplicate billing. The creation dialog starts with a client and container selection; a container shortcut can preselect those records.

## Procedure
1. Open **Invoices > New Invoice**, or the invoice action on the relevant container.
2. Select the client, then select at least one eligible container belonging to that client and branch.
3. Review the preview and the client's agreed rate. The backend uses the client's agreed clearing rate per container when present; otherwise it uses container clearing charges. The current dialog preview sums container charges, so verify the saved draft rather than assuming the preview is authoritative.
4. Set the due date, applicable VAT rate, branch selection where needed, and notes. In All Branches, confirm the explicit destination branch.
5. Create once. Open the generated invoice number and review each line, client details, subtotal, tax, total and due date.
6. While Draft, make permitted line or information corrections. Line amounts must be positive, and deleting the final line is not the way to cancel an invoice.
7. Issue/send only after checking a positive total and the final due date. Confirm the resulting status and print preview.

## Important Controls
Drafts are not collectible revenue. A zero-value draft cannot be sent. Once issued, the main billing fields and due-date rules are protected; do not attempt to repair an issued invoice by editing totals directly. Use the authorized correction process.

The date control may display a local format such as mm/dd/yyyy. Use the native date picker, then reopen the saved invoice and read its displayed date. A visually filled field is not proof that a valid date was submitted.

> Sending/issuing and external delivery are different. Confirm the status change, then inspect the relevant email/WhatsApp result if you intentionally used an external send action. Do not send test invoices to real recipients.

Basis: S7-S9. INV-001 and the lifecycle corrections provide recorded zero-value/draft safeguards.

# 27 | Invoice Life-Cycle Rules
!DIAGRAM(invoice)

| State | Financial treatment | Permitted operating approach |
| --- | --- | --- |
| Draft | Excluded from active receivables/revenue | Review and edit before issue; zero-value draft cannot be sent |
| Sent / issued | Eligible active invoice | Collect against current outstanding balance |
| Partial | Eligible; some net collection remains | Record only the balance actually received |
| Paid | Settled from net collection/credit position | No additional ordinary collection |
| Overdue | Date-derived unpaid position | Follow up; do not manually invent a paid status |
| Cancelled | No collectible contribution | Preserve audit history; no new collection |
| Written off | Excluded from active invoice population | Controlled bad-debt process, not a cash receipt |

Payment and overdue status are calculated from the eligible invoice, due date and net payments/credits. Cancellation is controlled and rejects an invoice with recorded payments. A correction may instead require an authorized credit note or reversal. Historical visible rows must not be added back into active Aging, Statement or VAT totals.

Basis: S8-S11. AR-002, STMT-001 and VAT-002 aligned report eligibility with this rule.

# 28 | Record a Client Collection
!SCREEN(invoice|Figure 4. A controlled invoice with payment history. Read the current net position and individual source rows; screenshot amounts are dated test evidence.)

1. Open the exact invoice and confirm it is issued/collectible, in the correct branch, and has an outstanding balance.
2. Choose **Record Payment** or the corresponding collection action. Enter the actual received amount and payment date.
3. Select method and the active same-branch bank when required. Enter the genuine reference and explanatory notes.
4. Check the amount against current outstanding, submit once, and wait for confirmation.
5. Reopen the invoice. Verify payment history, net paid, outstanding and Partial/Paid status. Compare the bank entry, client/AR position and Financial Ledger.

The current payment path rejects over-collection and collection against Draft, Cancelled or Written-off invoices. Concurrency controls protect the balance at submission time; a stale screen is not authority to collect again. If the response is uncertain, inspect history before retrying.

Basis: S8-S11. Historical overpayment was corrected using the traceable reversal in INV-002, not by deleting its original row.

# 29 | Invoice Corrections, Credits and Reversal
## Traceable Payment Reversal
1. As an authorized Branch Admin or higher, open the exact invoice payment history and identify the mistaken original collection.
2. Confirm its amount, date, method, bank and reference. Obtain the business reason and approval for the correction.
3. Use **Reverse** on that payment. Enter the required reversal date, reference and reason. The reversal date must not precede the original payment.
4. Submit once. Confirm a linked negative payment row, not disappearance of the original row.
5. Reconcile invoice net paid/outstanding, client credit, AR, bank, Financial Ledger, Cash Flow and Client Statement. A bank collection reversal is an outflow/debit on the relevant bank view.

The same original payment can be reversed only once. The isolated concurrent test confirmed one success and one conflict, with one linked reversal and consistent totals. Do not bypass that protection by manually creating another negative payment.

## Other Correction Paths
| Action | Intended use | Distinction |
| --- | --- | --- |
| Draft edit/delete | Correct an unissued document within allowed controls | Does not erase issued payment evidence |
| Cancel invoice | Withdraw an eligible invoice without recorded payments | Removes active collectible contribution; not a refund |
| Credit note | Authorized reduction/credit against an eligible invoice | Not an external bank transfer by itself |
| Apply client credit | Allocate existing client credit | Must not be entered again as a fresh receipt |
| Write-off | Authorized bad-debt treatment of remaining debt | Current workflow records associated overhead evidence; not a customer payment |

Keep reasons and linked source documents. A written-off or cancelled history row may still be printed for audit with zero collectible contribution. Do not force its old face value into current revenue or outstanding totals.

> Recommended policy: separate correction approval from the person who made the original entry where staffing permits. The application's available administrator action is not a substitute for that internal policy.

Basis: S1-S3, S8-S11.

# 30 | Accounts Receivable and Client Deposits
Accounts Receivable (AR) explains what clients owe under the eligible invoice population. It must distinguish gross invoice outstanding, unapplied deposits and credit balances rather than hiding them in one unexplained number.

## Review AR
1. Select the branch and open **Accounts Receivable**.
2. Review the client-level balances and aging buckets. Open the underlying invoices for material or unexpected balances.
3. Compare net outstanding with gross outstanding, unallocated deposits and credits shown by the page. Do not add a deposit as revenue because cash arrived.
4. Use current invoice due dates to prioritize follow-up. The Aging report is a live unpaid snapshot, not necessarily a retrospective balance as of a selected old date.
5. Export or generate the printable Aging report and verify the same excluded/cancelled population.

## Record and Allocate a Deposit
Where the client deposit action is available, select the client, branch, actual amount/date, payment method and bank/reference required by the form. Save once and inspect the client's available deposit/credit balance. When allocating to an issued invoice, use the controlled apply-credit process, bounded by available credit and invoice outstanding.

Allocation moves existing client money to an invoice; it must not create a second real bank receipt. Inspect both the original deposit evidence and allocation when reconciling the client wallet to collections.

## Follow-Up and Statements
Use authorized reminder/statement actions only after checking contacts, due dates and outstanding. A Paid, Cancelled, Draft or Written-off invoice should not receive an inappropriate overdue collection request. Print a client statement to explain the period movements and closing position.

> Historical test evidence: cancelled INV-202609-002 and INV-202609-003 were used to verify the AR-002 correction. Their former appearance in outstanding is a resolved historical defect, not a reason to recreate those records.

Basis: S1-S3, S8-S11.

# 31 | Bank Management and Reconciliation
## Establish an Account
An authorized administrator opens **Bank Management**, creates the account with the requested bank/account identity and branch, and records the supported opening balance. Agree the opening position before entering subsequent activity. A bank must be active and in the same branch as the linked payment where the form requires one.

## Funding and Transfers
1. Open the exact bank account and choose the supported funding or transfer action.
2. Enter actual amount/date, reference and notes. For a transfer, choose the distinct destination bank and check both account identities.
3. Submit once and verify source and destination entries. A transfer is a debit to one bank and a credit to another, not new income for the company.
4. Compare the account's balance to opening balance plus credits minus debits, using the displayed source records.

BANK-003 introduced duplicate reference protection for bank fund additions and transfers within a branch, normalized for whitespace/case. Do not claim this is universal duplicate detection across every payment module. An optional blank reference may be accepted where the form permits it, but a meaningful reference is recommended for traceability.

## Read the Bank Ledger
Filter by the relevant source, including Duty Payment. Clear Filters must also clear the search. For each disputed entry, follow its source: invoice collection, duty, container payment, overhead, standalone schedule, funding, transfer or reversal. Do not add a compensating entry merely because a filter hides the original.

## Reconciliation Checklist
- Correct branch and account; agreed opening balance.
- Matching period, dates, references and signed amounts.
- Both sides of internal transfers present.
- Reversals linked to their original sources.
- Approved-but-unpaid schedules excluded from actual cash movement.
- Missing-bank data-quality exceptions investigated without inventing evidence.

> The application records bank bookkeeping. Confirm real banking evidence independently when real transactions are used. A successful form submission is not proof that a bank executed an external transfer.

Basis: S1-S3, S9-S11.

# 32 | Container Payments and Disbursements
**Container Payments** records actual job-specific spending against a container and category/section. It is separate from entering a budget in a charge section, and separate from Customs Duty and company overhead.

## Posting Procedure
1. Confirm your authority for the action. The finance screen entry rule does not grant every posting permission to every Accounts user.
2. Search the exact container and wait for the query to finish. Verify branch, client and current payment history.
3. Select the appropriate expense category or section. Read the budget and remaining position where displayed.
4. Enter the actual amount, payment date, method, active same-branch bank when required, reference and description.
5. Submit once and reopen the history. Confirm the new payment is linked to the intended job and section.
6. Check Bank, Financial Ledger and Cash Flow. Use Disbursement Reconciliation to compare budget and actual spend at section level.

## Avoid Double Counting
A duty payment belongs in Duty Payments, not again under a general container category. Company overhead belongs in Overhead Expenses. If a transaction appears in several reports, it may be one source row viewed in several places rather than several independent expenses.

The current actual-cost reports include relevant duty ledger evidence alongside container disbursements. Read each report's population and date basis before comparing it with a filtered payments screen.

## Loading and Uncertain Results
CP-002 corrected the brief false no-payments state before loading completed. Wait for the settled result. If a post times out, search by amount/date/reference and inspect the bank/source history before retrying. Do not turn a network uncertainty into a duplicate disbursement.

> If a disbursement needs correction and no controlled reversal/edit action is available for that source, escalate with its ID and evidence. Do not delete the bank row or alter a running balance to conceal it.

Basis: S1-S3, S7, S9-S11.

# 33 | Customs Duty Payment and Reversal
The assessed duty is a liability snapshot. The Duty Payment Ledger is the dated evidence of actual payments and linked reversals. These two representations must be reconciled, not assumed identical for old records.

## Record Duty Payment
1. Open **Duty Payments**, find the correct assessed job and verify branch, container, liability and current paid/outstanding position.
2. Confirm the relevant approval/control requirements are satisfied. Enter the actual amount/date, method and supported same-branch bank selection.
3. Enter the reference and supporting information, submit once and reopen the job.
4. Confirm the ledger row and the revised duty position. Check bank activity and the Duty Payment Ledger export.

## Reverse a Mistaken Duty Payment
Use the authorized reversal action on the exact original transaction. Supply the required reversal date, reference and reason, then verify one linked negative duty row. Preserve the original payment and approval evidence. Do not use a reversal simply to make an inconvenient balance disappear.

A bank-paid duty reversal produces a bank credit/inflow; an invoice-collection reversal produces the opposite bank direction. Check Financial Ledger, Cash Flow, duty totals and the relevant actual-paid P&L population. DUTY-002 was live tested with a controlled reversible record; the immutable correction is not a delete function.

## Duty Reconciliation Categories
| Position | Meaning | Required response |
| --- | --- | --- |
| Matched | Snapshot and signed ledger evidence agree | Retain supporting records |
| Historical / unledgered | Old paid snapshot lacks dated transaction evidence | Investigate; do not invent date/source/reference |
| Needs attention | Inconsistent recorded amounts or evidence | Review source rows and obtain authorized correction |

> Never reconstruct ledger transactions from a balance alone. If original evidence cannot be found, keep the limitation visible. A report cannot legitimately manufacture a recorder, bank, payment date or reference.

Basis: S1-S3, S8-S11.

# 34 | Payment Schedules: Request to Payment
!SCREEN(schedules|Figure 5. Payment Schedule page captured in the live test-data environment. Counts and date buckets depend on scope and the current date.)

## Procedure
1. Create a schedule with the correct branch, payee/vendor, description, amount and due date. Link an overhead expense when it is genuinely an overhead payment request.
2. Submit through the available approval workflow. The approver reviews source evidence and either approves or rejects with a reason.
3. After approval and actual payment, use the payment action and enter the required payment evidence, including bank/reference where applicable.
4. Reopen the schedule and verify status plus immutable payment evidence. Compare its linked bank, Financial Ledger and Cash Flow entries.

A standalone schedule uses its own payment source row. An overhead-linked payment contributes through the overhead payment history so it is not counted twice. Pending or approved-but-unpaid requests are not cash outflows.

Date buckets are literal: Overdue is before today; Today is today; Tomorrow is the next day; future schedules belong in Upcoming. Completed and Cancelled have separate meanings. SCHED-002 corrected date-bucket/count confusion.

Basis: S1-S3, S9-S11. The historical N500 ledger limitation is retained in chapter 48.

# 35 | Overhead Expenses
Overhead covers company operating expenses rather than a specific container charge. The expense liability, additional funding/top-ups and actual payments are different records and must not be confused.

## Create and Maintain
1. Open **Overhead Expenses** with an authorized profile and select the correct branch.
2. Create the expense using the description, category, responsible/SA details, amount and other requested fields.
3. Save and reopen. Check the total liability, paid amount and balance.
4. Use **Add Money** only for a genuine increase to the expense allocation/liability, with its supporting explanation. It does not mean the expense has been paid.

## Direct Payment
Open the expense payment action, enter actual amount/date, method, bank/reference and notes, then submit once. Verify the expense payment history and reduced balance. Reconcile the dated payment to Bank, Financial Ledger, Cash Flow and the relevant P&L overhead population.

## Scheduled Payment
Create the linked overhead payment schedule, obtain approval, then record its actual payment through the approved schedule workflow. Confirm that the expense's paid total increases only once and that the linked evidence is visible. Do not also enter the same transaction as a direct payment.

## Statement and Deletion
Generate the overhead statement/print view to inspect the original expense, additions, payments and balance. Deletion of a controlled unpaid test expense was tested; it is not a blanket permission to erase paid financial history. Use only the available authorized control and preserve all payment evidence. Historical immutable payment rows remain relevant to reports even if a parent expense is no longer present.

OH-002 corrected the brief empty/zero display during refresh. Existing data should remain visible while refreshing, with a proper loading state. Wait for the settled result before interpreting a zero balance.

> Example: expense total NGN 100,000, direct payment NGN 40,000, linked scheduled payment NGN 60,000. Paid is NGN 100,000, not NGN 160,000. Approval of the NGN 60,000 request alone leaves paid at NGN 40,000.

Basis: S1-S3, S9-S11.

# 36 | Notifications and Communication Controls
## Read and Act
Open Notifications, select the relevant view/filter and follow the linked job or financial record. Check the timestamp, branch and event type. Read/unread state is a user attention marker, not completion of the underlying task.

PAAR overdue alerts should be labeled **PAAR Overdue**, not Low Profit Margin. Operational deadlines and financial margin alerts are different conditions. NOTIF-001 corrected that misleading category; AI notification totals were also aligned with the Notifications source.

## Workflow Event Interpretation
Payment Scheduled and Payment Approved events should be created once per applicable user for a transition. Duplicate rows for the same user/event were corrected at the creation source. Events for different recipients are not automatically duplicate payments. Use the schedule and its immutable payment row to determine actual money movement.

## External Messages
Email and WhatsApp depend on configured providers, sender identities, recipients and supported templates. An invoice reminder, receipt or statement can be an external communication. Review the recipient, document and current balance before sending. Never use real customer contact details merely to test a button.

A successful provider acceptance response does not prove delivery, reading or client agreement. A disabled provider, missing verified sender, missing phone/email or unavailable template can prevent sending without invalidating the underlying invoice.

## Operational Routine
- Review urgent and overdue work in the correct branch each day.
- Open the source before approving, paying or changing a stage.
- Record the action in its proper module, not solely as a note.
- Recheck the notification after the source state changes.
- Escalate repeated or misleading alerts with record ID and timestamp.

> Recommendation: agree which notification categories each department owns and who covers absences. Alerts cannot replace a named stage owner and a clear next action.

Basis: S1-S3, S6-S7, S9, S12.

# 37 | Dashboards, Analytics and Profit Labels
## Operations View
The operational Dashboard uses budgeted clearing charges and costs to estimate job profitability. **Gross Profit before Overhead** is not a bank balance. The operational **Net Profit after Overhead** remains part of an estimate-oriented view; do not substitute it for the separate financial calculation.

Total Containers and In Progress describe operational populations. Completed follows actual delivery evidence. Containers in Terminal refers to physical-terminal presence, not the early TDO queue or all registered jobs.

## Financial View
The separate Financial View shows accrual invoice revenue, actual paid cost information, actual paid overhead and resulting net profit using the shared P&L calculation. Select the same branch/period as the P&L before comparing. Draft, Cancelled and Written-off invoices are excluded from the active financial population.

## Analytics and Branch Comparison
Analytics combines operational performance, budgeted profitability, cost breakdown and staff productivity. Read the basis labels and period controls. Branch Comparison provides a Super Admin's cross-branch overview and supports the relevant cost-basis distinction. The corrected actual-cost comparison matches the recognized P&L population.

| Figure | Means | Does not mean |
| --- | --- | --- |
| Budgeted gross profit | Planned clearing charges less budgeted costs | Collected cash |
| Accrual revenue | Eligible invoiced revenue | Bank receipts for the period |
| Actual paid costs | Signed source costs under the report recognition rule | Every budget estimate |
| Actual paid overhead | Eligible immutable overhead payments | All approved unpaid expenses |
| Net profit | Revenue minus recognized costs and overhead under the selected basis | Bank closing balance |

> A mismatch investigation starts with scope, dates, basis and invoice eligibility. Never change source amounts merely to make unlike dashboard cards equal.

Basis: S1-S4, S8-S11.

# 38 | Reports: Choose the Right Output
!SCREEN(reports|Figure 6. Reports landing page. The upper report set is budget-oriented; source-linked actual evidence appears in Report Centre and Accounting Control below it.)

## Standard Generation Procedure
1. Decide the question: operational progress, money movement, client debt, profitability or reconciliation.
2. Select the correct branch, dates, status/client/bank and cost basis where offered.
3. Choose Apply/Generate and wait for the completed result. A placeholder before generation is not a zero report.
4. Read the heading, basis note and source details. Open a sample source record.
5. Export CSV/Excel or open the printable report where supported. Verify headers, period, totals and last-page rows before distributing.

Different reports intentionally use different dates. Delivery uses actual delivery date; Cash Flow uses transaction dates; Aging is a current snapshot; P&L uses its recognition rule. There is no single date filter that makes all of these equivalent.

Basis: S8-S11.

# 39 | P&L, Cash Flow and Reconciliation
## Profit and Loss
Open Reports > Profit & Loss, select dates, optional client and cost basis, then Generate P&L. Revenue follows active financial invoices. Under Actual Paid Costs, container costs are recognized through the container's **first active invoice date** and counted once for the selected period, using signed container/duty payment evidence. Overhead comes from actual immutable overhead payments under the report's period rules.

This is the application's current reporting model, not an assertion that every accounting recognition policy is configurable. A client-filtered report should be read with its displayed overhead scope; shared company overhead is not automatically a bespoke client allocation.

## Cash Flow
Open the Cash Flow report with From, To and Bank or All Banks. Review opening position, inflows, outflows and closing position under the selected scope. Internal transfers do not create consolidated income/outgoings. Per-bank activity shown inside consolidation is labeled **Net Movement**, not an invented Closing Balance.

## Explain Differences in This Order
1. Match branch and selected records.
2. Match dates and identify the date field used by each report.
3. Match Budgeted versus Actual Paid cost basis.
4. Exclude Draft, Cancelled and Written-off invoices consistently.
5. Inspect credit, reversal and historical unledgered adjustments.
6. Compare transaction source IDs rather than adding repeated views of the same row.
7. Check internal transfers, company overhead and first-invoice recognition.

Example: a container is invoiced in September but some job costs were paid in August. Its September actual-cost P&L can recognize those costs with that invoice population, while September Cash Flow will not pretend the August cash left again in September.

> Do not treat a report as reconciled only because its bottom line looks plausible. Retain the filters, source export and explanation of any historical missing evidence. RPT-003 and FIN-003 corrected actual-cost population and cash-flow presentation inconsistencies.

Basis: S1-S3, S8-S11.

# 40 | Report Catalogue and Evidence
| Report | Purpose and basis | How to use the result |
| --- | --- | --- |
| All Containers / Client / Operations / Financial / Monthly | Operational container and budgeted commercial/cost summaries | Filter branch/status/dates; do not call planned costs paid |
| Duty Payment Ledger | Signed dated duty payments and reversals | Trace date, source, reference, recorder and container |
| Department Workflow | Stage-specific owner, expected/actual dates and progress | Check parallel work and independent accountability |
| Duty Reconciliation | Snapshot paid position versus ledger evidence | Investigate historical/unledgered differences |
| Financial Ledger | Actual source-linked money movements | Follow collections, duty, overhead, disbursements, schedule payments, funding and transfers |
| Finance Review Queue | Data-quality exceptions such as bank payments without a bank | Review evidence; it is not a fraud finding or automatic correction |
| Disbursement Reconciliation | Budget versus actual by container/section, with payment-date filtering | Expand row and inspect variance sources, including relevant duty evidence |
| Delivery Tracking | Actual delivered records and related transport/custody data | Generate using actual delivery dates; compare Dashboard Completed |
| Exchange Rate History | Recorded supported USD/NGN charge rates | Review recorded conversion history, not live market quotes |
| Invoice Aging | Current unpaid eligible invoice snapshot by overdue bucket | Prioritize collection; match printable Aging |
| Client Statement | Client opening, period invoice/payment activity and closing position | Explain balance; excluded audit rows must not inflate collectibility |
| VAT Summary | Eligible invoice VAT calculation for selected period | Review invoice population and configured rate; obtain tax review before filing |
| P&L | Active invoice revenue and selected cost basis less overhead | Reconcile recognition population, not only cash dates |
| Cash Flow | Actual dated cash/bank movement and consolidated transfer treatment | Reconcile selected bank opening and signed movements |
| Branch Comparison | Cross-branch performance under its selected basis | Match shared recognized actual-cost population when comparing P&L |

The UI's Financial report tab is not automatically the same calculation as the P&L. Read the visible basis statement rather than relying on the word Financial in a tab name.

Basis: S8-S11.

# 41 | Printable Documents and Exports
## Invoice and Container Prints
From the source record, open its print action. Confirm client, branch, container/B/L links, line descriptions, amounts, dates and totals. A container print reports that job's commercial/operational information; it is not a substitute for an issued invoice or payment receipt.

## Statement, VAT and Aging
For Client Statement, select the exact client and period. For VAT Summary, choose the intended period or knowingly leave it all-time. For Invoice Aging, remember that it is a current unpaid snapshot. Compare printed and on-screen figures and verify that cancelled invoice face values do not re-enter the total.

VAT Summary is the application's invoice-tax calculation. Even if interface wording mentions filing, do not assume it proves tax compliance or that a displayed rate is appropriate to every transaction. Confirm rates, eligibility and filing treatment with the organization's responsible finance professional.

## Export Procedure
1. Apply the filters and wait for data to settle.
2. Use the available CSV/Excel export or printable report action.
3. Permit the intended print tab/pop-up in the browser if required.
4. In print preview choose the appropriate paper size, margins and scale. For PDF output choose the browser's Save as PDF destination.
5. Check all pages, column endings, totals, footer and report period before saving or distributing.

## Data Handling
Spreadsheets can expose detail not visible in a dashboard card. Store exported reports in an approved location, include branch/period/basis in the filename, and share only with authorized recipients. Do not send the current live test screenshots as official financial statements.

> If a print page opens but download handling fails in a specific browser/tool, separate route access, rendering and final file transfer. The earlier test limitation did not prove that all application documents were unavailable.

Basis: S1-S3, S7-S11.

# 42 | Scheduled Report Delivery
The Report Centre supports scheduled **Duty Payment Ledger summaries** and **Department Workflow summaries** in the reviewed first release. Do not assume every report in the catalogue has an automated email subscription.

## Create a Subscription
1. As a permitted Branch Admin or higher, open Reports and locate Scheduled Report Delivery.
2. Select the report type and branch context. Choose Daily or Weekly; for weekly delivery select the day.
3. Enter validated recipient addresses, within the supported maximum of 20.
4. Set the fixed **Africa/Lagos** delivery time. Review the displayed schedule summary.
5. Save and verify the subscription. Saving does not send immediately.

## Check Delivery Evidence
Use the supported test-send only when an actual external message is authorized. Inspect delivery attempts and their result. The retained recent delivery log is evidence of provider handling, not proof that a recipient read the message.

The Duty Ledger email is a summary; use CSV/source records for transaction-level investigation. Workflow email is an as-of-now stage snapshot, not a reconstructed view of what every job looked like last month.

## Pause and Retain
Archive/pause a subscription that should stop sending while retaining its history. Physical deletion is restricted where delivery evidence exists. Do not remove a subscription just to conceal a failed send.

## Troubleshoot
Check active state, frequency, weekday, Lagos time, recipients, branch scope and provider configuration. For sender or credential problems, involve the system administrator rather than placing API keys in the recipient field. A schedule waiting for its next due time is not a failed immediate send.

> System alert email settings can show server-time scheduling. Do not copy a time blindly between that feature and Report Centre subscriptions.

Basis: S8, S11-S12; the reviewed report-subscription scope is narrower than the full Reports catalogue.

# 43 | AI Assistant and Controlled Assistance
The AI Assistant is a governed interface to approved application tools. It can interpret questions, investigate multiple sources, retain conversation context, provide evidence-backed answers and prepare supported report/document or action drafts. It is not an unrestricted database administrator.

## Ask a Useful Question
- "How many containers are physically in the terminal in Lagos?" is different from "Show active Terminal/TDO jobs."
- "Show the documents linked to container [exact number]" requests the job's files, not a text search for any document containing a similar number.
- "Find payment schedules for [exact vendor name]" should cite the matching schedule, not unrelated requests.
- "Prepare the Actual Paid P&L for this branch and period" identifies the financial basis.

Read the branch scope, facts, calculations, cited records, assumptions and limits. Click the source record and check identifiers and dates before acting. AI can explain the current department owner; it must not substitute a stale generic owner. Saved old All Branches briefings must say **Historical snapshot**, not Current.

## Drafts and Actions
A supported action draft is not an executed action. Review its fields, source record and branch; a second explicit confirmation is required for allowed assisted actions. Do not expect AI to approve, pay, verify, delete or send external messages outside its permitted boundary. If it cannot safely answer, use the normal module or clarify the question.

## Governance and Evaluation
Super Admin controls provider enablement, rollout access and related governance. Continuous Evaluation checks anonymized business questions and approved-tool selection. Enter the expected interpretation/tool and correction guidance without real client identifiers or document contents. A passing interpretation suite is not a live financial reconciliation or automatic training on every chat.

AI-002 through AI-008 have specific recorded fixes/re-tests covering owners, invoice eligibility, notifications, exact schedules, briefing labels, documents and citation links. Provider cost/budget and retention descriptions must not be assumed universally enforced from a settings label alone.

Basis: S1-S5, S12-S13.

# 44 | Worked Job: Intake to Releases
This three-chapter example is fictional and simplified. Do not enter it again into the live system. Use a separate approved training environment and unique identifiers when practicing. The example applies zero VAT solely to keep the arithmetic clear; it is not a tax recommendation.

## Training File
| Field | Illustration |
| --- | --- |
| Branch / client | Training Lagos / Training Imports Ltd |
| Container / B/L | TRNU1234567 / TRAIN-BL-001; illustrative identifiers |
| Commercial charge | NGN 1,200,000 |
| Planned job cost | NGN 700,000 |
| Actual job cost target | Duty 300,000; Shipping 150,000; Terminal 100,000; Delivery 100,000 |
| Company overhead | NGN 100,000, all paid in the example period |

## Operational Walkthrough
1. Administrator prepares the branch, client, appropriate staff and same-branch bank. The intake officer registers the job and links its B/L and initial documents.
2. Assigned officers verify the identifiers and confirm actual berthing when supported. The verified job becomes available to the early desks.
3. Documentation owner Ada records required documents, PAAR number and actual PAAR release date. Assessment evidence establishes NGN 300,000 duty liability.
4. Accounts records the authentic duty payment through Duty Payments, not as an extra generic container disbursement.
5. Transire owner Ben saves a planned date, then records actual Transire release. Shipping owner Chidi independently records DO planning and release. Terminal/TDO owner Dami records TDO planning and release.
6. Pull-Out owner Efe verifies TDO release and records the actual Pull-Out event. The readiness review confirms all five required release evidence groups.

Each owner remains independent. Saving Dami as Terminal/TDO owner must not overwrite Ada, Ben or Chidi. Planned dates remain distinct from actual dates. A missing required release stops the intended downstream handover even if the broad pipeline label has moved.

# 45 | Worked Job: Delivery and Billing
## Complete the Physical Process
1. Security confirms the actual loaded Gate-In after the release checks. The Terminal Manager reviews Gate-In, records Examination details and confirms Final Release only when supported.
2. Security records loaded Gate-Out. Delivery staff record the actual delivery date, driver/truck and relevant delivery evidence.
3. The applicable empty-return procedure is completed. If the empty container returns through the terminal, Security records Empty Gate-In and then Empty Gate-Out; the latter sets the return date.
4. Reopen the job and generate Delivery Tracking for that actual date. Dashboard Completed increases for the delivered job in the same branch. Administrative closure follows the final checklist, not a fabricated delivery date.

## Create and Collect the Invoice
1. Accounts selects Training Imports Ltd and the container, reviews NGN 1,200,000 clearing charges, sets a valid due date and reviews the zero-tax training assumption.
2. Create Draft, review its lines and issue the positive-value invoice. The active invoice contributes NGN 1,200,000 revenue in this simplified example.
3. Record an actual NGN 500,000 bank collection with its reference. Status is Partial and remaining debt is NGN 700,000.
4. Record the later NGN 700,000 collection against the same invoice. Net collected is NGN 1,200,000 and remaining debt is zero. No further collection is permitted.
5. Generate the invoice print and client statement. AR must not still show NGN 700,000 after the second payment.

## What Not to Do
Do not create a second job for Shipping. Do not add the approved schedule value to actual payments. Do not mark the invoice Paid because delivery is complete. Do not enter a client credit application as another fresh bank receipt. Do not delete an original payment to correct a mistake.

If a collection was recorded incorrectly, use the authorized linked reversal with a reason, then review every affected balance before making any replacement entry.

# 46 | Worked Job: Reconcile the Money
The example assumes all intended collections and payments are in the comparison period, one eligible invoice, no credit notes, no opening balances, no transfers and no other jobs. Real reports require their own date/recognition rules.

| Calculation | NGN | Explanation |
| --- | --- | --- |
| Invoice revenue | 1,200,000 | Positive active invoice; zero VAT training assumption |
| Duty actual paid | 300,000 | Duty ledger source, not duplicated as a disbursement |
| Other job disbursements | 350,000 | Shipping 150,000 + Terminal 100,000 + Delivery 100,000 |
| Total actual job cost | 650,000 | 300,000 + 350,000 |
| Gross profit before overhead | 550,000 | 1,200,000 - 650,000 |
| Actual paid overhead | 100,000 | Direct payment 40,000 + linked scheduled payment 60,000 |
| Net profit under this model | 450,000 | 550,000 - 100,000 |
| Actual collection | 1,200,000 | 500,000 + 700,000 |
| Invoice outstanding | 0 | Fully settled |
| Simplified net cash movement | 450,000 | 1,200,000 receipts - 750,000 actual payments |

Budgeted gross profit is NGN 500,000: the same NGN 1,200,000 commercial charge less NGN 700,000 planned cost. It differs from actual gross profit because actual job spending is NGN 50,000 below budget. That difference is not automatically an error.

## Cross-Module Sign-Off
Confirm invoice and AR agree; duty snapshot matches its ledger; Container Payments totals NGN 350,000; overhead paid totals NGN 100,000 once; bank entries match the same signed transactions; Financial Ledger and Cash Flow show actual movements; Actual Paid P&L and Financial Dashboard use the same recognition population.

The NGN 60,000 overhead schedule affects cash only after payment. If still merely approved, overhead actual paid is NGN 40,000 and cash/net-profit figures change accordingly. Record the actual state rather than forcing the example's target numbers.

# 47 | Troubleshooting and Common Mistakes
| Symptom | Check first | Correct response |
| --- | --- | --- |
| Job missing from a workspace | Verification, branch, workspace access, prerequisites and Active/Released tab | Find the original; do not create a duplicate |
| Owner appears wrong | Department title and independent stage-owner fields | Correct that department through its normal control |
| Save did not release a job | Expected versus actual date | Use release only when the event really occurred |
| TDO jobs but zero physical terminal | Different populations | Inspect Gate-In/Examination/Final Release and Gate-Out |
| Closed job not counted Completed | Actual delivered date | Verify delivery evidence and Delivery Tracking |
| Finance access denied | Job function, authority and branch | Correct legitimate access only; do not grant blanket Super Admin |
| Valid operations request denied | Current deployed release and authenticated profile | Escalate with URL/status; API-ROUTE-001 is recorded closed |
| Invoice will not send | Draft total, required fields and date validity | Correct the draft; zero value cannot issue |
| Payment rejected | Outstanding, status, branch bank, reference and concurrent change | Refresh history before retrying |
| Reversal conflict | Existing linked reversal | Do not reverse the same original twice |
| Report differs from another screen | Branch, date field, cost basis, eligible invoices and credits | Reconcile source IDs and recognition rules |
| Old payment missing from ledger | Historical unledgered evidence | Investigate authentic source; do not fabricate backfill |
| Briefly empty page | Query/loading state and filters | Wait for settled data; record persistent failures |
| File not found by AI | Job linkage, upload success, index status and exact identifier | Open the job document directly, then refine the request |
| Print/download not opening | Pop-up permission, authentication and browser handling | Separate route/render failure from final download handling |
| Deployment fails | Build logs and exact TypeScript/schema error | Technical fix/build verification; do not alter financial data |

Support handover should include time, account function (not password), branch, source ID, intended action, exact message, screenshot and deployed release. Hide secrets and unnecessary personal data.

# 48 | Live-Test Findings and Corrected Rules
This is a consolidated index of the latest confirmed closures, not a rerun of the entire audit during manual authoring. Full historical observations and amounts remain in S2.

| Record(s) | Correction or confirmed rule | Training consequence |
| --- | --- | --- |
| DASH-001, AR-002 | Eligible invoice population and cancelled Aging treatment aligned | Do not count cancelled invoices as outstanding |
| BRN-001 | Explicit selected-branch creation works from All Branches | Select a real branch and same-branch linked records |
| OPS-001, AI-002 | Authoritative independent department owners | Do not use stale generic ownership |
| OPS-002, PIPE-001 | Operational released/progress visibility corrected | Check appropriate stage and view |
| DEL-001 | Delivery date persists and matches Dashboard/Tracking | Physical delivery is not inferred from Closed |
| APR-001 | Rejection refreshes Approval Queue immediately | Check the queue after a decision |
| NOTIF-001, NOTIF-002, TASK-001 | PAAR label, duplicate event creation and assigned queue corrected | Use source events and real assignments |
| AI-003, AI-004 | Eligible invoice evidence and notification totals corrected | Compare cited records under current scope |
| AI-005, AI-006 | Exact vendor schedule lookup and historical briefing label corrected | Check exact identity and snapshot date |
| AI-007, AI-008 | Document lookup and citation link corrected | Verify upload/link/index and source access |
| BANK-002, BANK-003 | Filter/search reset and normalized reference protection | Inspect exact scope and reference before retry |
| SCHED-001, SCHED-002 | New standalone payment evidence and literal date buckets corrected | Approval is not payment; Today means today |
| CP-002, OH-002 | False empty/zero loading flashes corrected | Wait for settled queries |

**Historical exception:** the earlier paid NGN 500 schedule has no reconstructed immutable payment row. The new path passed a controlled NGN 1 posting test. That does not automatically repair the old ledger. A separate authorized correction needs genuine bank/date/reference/approval evidence; no automatic backfill was performed.

# 49 | Financial Findings and Verification Limits
| Record(s) | Latest recorded outcome | Operating implication |
| --- | --- | --- |
| RPT-001, RPT-002, RPT-003 | Report and actual-cost population reconciliation corrected/re-tested | Match shared sources and selected basis |
| FIN-002, FIN-003 | Recognized financial totals and cash-flow presentation corrected/re-tested | Net bank movement is not an invented closing balance |
| VAT-001, VAT-002 | VAT output and active-invoice population corrected | Exclude ineligible invoice tax from current totals |
| STMT-001, CLT-001 | Statement and client/AR eligibility aligned | Audit-only history must not inflate debt |
| CONT-RPT-001, INV-001 | Container print accuracy and zero-draft issue control verified | Review source print and positive issue amount |
| DUTY-002 | Traceable duty reversal implemented and live tested | Preserve original; reconcile signed correction |
| INV-002 | Invoice reversal and concurrent protection verified | One reversal only; reconcile wallet/bank/reports |
| SEC-02, API-ROUTE-001 | Finance boundary and scoped router correction verified | Non-finance staff retain allowed operations, not finance |

## Coverage Boundaries
Recorded evidence includes 85 API unit tests, 11 isolated database integration cases and 12 final authenticated live staff API checks. The two older seeded delivery/duty suites were excluded from that final integration run. Closure does not certify every device, keyboard path, email recipient, file-download environment or user-creation double-submit case. The older empty-user-list report was not reproduced in a fresh login.

## New Source-Review Follow-Up: MANUAL-GATE-001
While preparing this manual, the gate handlers were inspected without executing them. Gate-In can accept a Shipping/Pull-Out status or existing Pull-Out release without the full readiness helper; it can also overwrite an existing Gate-In timestamp. Gate-Out and Empty Gate-In lack explicit earlier-event prerequisites in those handlers. This is a **source-observed control gap, pending targeted test and assessment**, not a claimed new live-test failure. No fix or gate write was performed. Follow the full release/physical-evidence procedure and investigate this separately before claiming all gate paths enforce it.

**MANUAL-INV-001, source-review follow-up:** invoice creation preview sums container clearing charges, but creation on the server gives priority to a client agreed rate. If those values differ, preview and saved totals can differ. This path was not exercised live for the manual. Review the saved draft before issue; targeted verification and a preview correction should be considered separately.

The earlier remediation round remains closed on its recorded scope. These source-review follow-ups and the historical unledgered schedule are not erased by that closure.

# 50 | Technical Deployment and Recovery
## Maintained Runtime
The frontend lives in `artifacts/cost-analysis`; the API in `artifacts/api-server`; PostgreSQL schema in `lib/db`. The repository pins pnpm 11.0.8. Recorded Railway runtime evidence used Node 22.23.2. In a fresh checkout, install dependencies with `corepack pnpm install --frozen-lockfile`, using the pinned toolchain, then run the maintained build. Prefer current repository configuration over manually changing versions to match this document later.

| Railway step | Repository command / control |
| --- | --- |
| Build | `pnpm run railway:build` performs type checks and frontend/API builds |
| Pre-deploy schema | `pnpm run railway:db:push` uses the maintained database push command |
| Start | `pnpm run railway:start`, serving the built API/application |
| Health | `/api/healthz`, configured health-check timeout 120 seconds |
| Restart | ON_FAILURE policy in railway.toml |

## Required Configuration Families
Production database/authentication uses `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `FRONTEND_URL` and the service `PORT`. Private document storage uses `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `DOCUMENT_STORAGE_ENDPOINT`, `DOCUMENT_STORAGE_REGION`, `DOCUMENT_STORAGE_ACCESS_KEY_ID` and `DOCUMENT_STORAGE_SECRET_ACCESS_KEY`.

Optional integrations include `AI_ASSISTANT_OPENAI_API_KEY` / `AI_ASSISTANT_OPENAI_MODEL`, Resend key/default sender, and Meta WhatsApp token/phone-number/template configuration. Configure only authorized providers and keep values out of source control and this manual.

## Release and Recovery Procedure
Read Project State and Git status, preserve unrelated changes, make the scoped correction, run relevant tests and the production build, update records, commit/push and verify the actual deployed revision/health. A successful Git push is not a successful Railway deployment. Read build logs for exact errors rather than assuming every failure is hosting instability.

Preserved checkpoints include `checkpoint-before-rbac-user-migration-2026-08-28` and `checkpoint-before-user-role-restructuring-2026-08-28`. Do not delete or move them. **Git restores code, not the live database or document bucket.** Before schema/data work, confirm separate backup and recovery coverage for PostgreSQL, files and configuration. Never run a destructive test reset against production.

Basis: S1-S3, S12-S14.

# 51 | Safe Testing, Handover and Maintenance
## Isolated Database
The separate Railway `integration-test` environment hosts `Postgres-2Wsy` and database `cost_management_integration_test`. It was created empty; production was not copied. Temporary public TCP access was removed after testing, leaving the service Online/Unexposed with its private volume.

The guarded `pnpm test:integration` requires `TEST_DATABASE_URL`, rejects production URL reuse, checks test/integration naming and requires explicit remote-host permission. Optional reset is restricted to the exact disposable database. Future local access needs a deliberately selected test tunnel/proxy; do not expose production as a shortcut. Docker is an optional local alternative, not a requirement of the deployed application.

## Test Discipline
1. Read all three continuity records and Git status before acting.
2. Identify the exact unresolved test; do not restart completed writes.
3. Reuse controlled records when appropriate and create uniquely labeled dummy data only when necessary.
4. Capture before/after source IDs, dates, amounts, branch and expected cross-module effects.
5. Verify both permitted and denied access with an independent staff session.
6. Clean up only through supported reversible procedures; retain audit evidence and any historical limitation.
7. Record result as passed, failed, source-reviewed or blocked, with the exact stopping point.

## Three-File Continuity
Project State is authoritative for current work and decisions. The Live E2E Register preserves test evidence and issue status. Session summaries record concise handoffs, commits and next action. None should store passwords or connection strings. Update them after major work, not only when a user asks.

## Recommended Operating Reviews
Daily: deadlines, assigned tasks, gate/delivery exceptions and unpaid approved schedules. Weekly: branch/user access, bank/AR/duty reconciliation and missing documents. Monthly: selected-basis P&L/Cash Flow, historical exceptions, backups and retained exports. After each release: targeted regression and manual revision.

This manual is maintained source plus a generated PDF. It must change when behavior changes; a static PDF cannot serve as permanent proof of a moving application's current state.

# 52 | Sources and Review Basis
## Reviewed Source Map
Paths are relative to the canonical `Cost-Management-System-restored` repository. These are application evidence references, not external regulatory guidance.

| Ref | Source |
| --- | --- |
| S1 | `docs/PROJECT_STATE.md` - current authoritative state and superseding decisions |
| S2 | `docs/LIVE_E2E_TEST_REGISTER.md` - dated tests, issues, corrections and limitations |
| S3 | `docs/SESSION_SUMMARIES/2026-09-05-isolated-invoice-reversal-integration.md` - latest deployment/integration handoff |
| S4 | `artifacts/api-server/src/lib/ai-business-definitions.ts` - maintained business vocabulary, reconciled with newer rules |
| S5 | Shared access-policy and API authorization modules - authority, function, workspace and branch capabilities |
| S6 | API container routes and workflow-readiness helper - stage actions, officers, gate and transition rules |
| S7 | Frontend App routes, pages and invoice creation component - navigation, forms, labels and print entry points |
| S8 | API invoice, duty and report routes/helpers - eligibility, reversal, signed financial evidence |
| S9 | API bank, container expense, overhead and payment-schedule routes - source posting and guards |
| S10 | Dashboard, analytics and financial-report calculation code - basis and recognized populations |
| S11 | Reports specification, report subscriptions and screen/print implementations |
| S12 | Settings, auth/setup and storage/provider configuration source |
| S13 | AI tool registry, answer/governance paths and recorded AI acceptance |
| S14 | `package.json`, `railway.toml`, integration configuration and checkpoint records |

## Conflict Resolution
Current authoritative closures in S1/S2 supersede original failed test rows. Newer scoped source rules take precedence over old glossary shorthand. A captured screen proves the captured view, not every possible permission or write path. Recommendations in this manual are not described as automatic controls. The original records remain intact; this is a synthesized reference, not a replacement audit log.

# 53 | Glossary and Training Sign-Off
| Term | Meaning in this application |
| --- | --- |
| AR | Accounts Receivable: eligible client debt, with deposits/credits distinguished |
| B/L | Bill of Lading, linked to the container/job identity |
| PAAR | Pre-Arrival Assessment Report; number and actual release evidence matter |
| DO / TDO | Delivery Order / Terminal Delivery Order; separate operational releases |
| ETA / actual berthing | Planned arrival / separately confirmed arrival event |
| Accrual revenue | Eligible invoiced revenue under the application's report rules |
| Actual paid | Dated source payment evidence net of valid linked reversals |
| Disbursement / overhead | Job-specific spending / company operating expense |
| Stage owner / workspace | Job-stage accountability / granted department access |
| Snapshot | Information at a stated time, not automatically a fresh result |
| Custody | Tracked physical possession and empty-container return position |
| Reconciliation | Explaining totals by matching underlying source records and scope |
| Draft / approval / payment | Preparation / authorization / actual recorded money movement |
| Reversal | Linked correction preserving the original financial record |

## Training Sign-Off
A trained user should be able to identify their branch/access, find one job, explain planned versus actual dates, complete their permitted task, locate supporting evidence, avoid duplicate posting, choose the correct report basis and explain how to escalate an exception. Management should validate organization-specific responsibilities before adopting this as its formal operating procedure.

## Practical Assessment
Ask the trainee to demonstrate one permitted task in an approved training environment, then explain one operation they must not perform. For Accounts, require a source-to-bank-to-report reconciliation. For Operations, require independent owner/date checks and a correct handover. For Security and Delivery, require distinction between release, gate, actual delivery and empty return. Record the trainer, date and any retraining requirement outside the business transaction ledger.

# 54 | Operational Quick Reference
!SCREEN(operations|Figure 7. Live Operations overview, captured read-only. Parallel department work and the broad pipeline stage are related but not identical.)

## Which Screen Should I Open?
- **Containers:** the central job file, identifiers, linked documents and commercial sections.
- **Operations / Pipeline:** administrative progress and stage oversight.
- **Documentation / Transire / Shipping / Terminal-TDO / Pull-Out:** the assigned early department's work, owner and release evidence.
- **Terminal Manager:** physical Gate-In, Examination and Final Release supervision.
- **Gate Security:** actual loaded and empty gate movements.
- **Delivery / Transport:** actual delivery, transport and empty-return/custody position.
- **Accounts and finance modules:** invoices, payments, duty, banks, expenses and reconciliation under granted authority.

When a job is not where expected, check branch, verification, prerequisites, filters and Released/Submitted views before creating anything new. Use the source ID in an escalation so another department can open the same job.
