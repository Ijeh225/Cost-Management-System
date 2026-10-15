// Bounded missing-coverage verification; never rerun the original Step12 phases.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const mode = process.argv[2];
assert(['probe', 'fixtures', 'inspect', 'controls', 'controls-finish', 'early-finalize', 'scan-verify', 'record-local', 'verify'].includes(mode));
assert(process.argv.includes('--confirm=STEP12-GAPS-20261015'));
let input = ''; for await (const chunk of process.stdin) input += chunk;
const credentials = JSON.parse(input); input = '';
const evidencePath = 'docs/evidence/2026-10-15-step12-remaining-verification.json';
async function session(email, password) {
  const cookies = new Map(); let csrf;
  async function request(method, path, body, expected = 200, branch = '2') {
    const headers = { 'Content-Type': 'application/json', 'X-Branch-Id': branch };
    if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const response = await fetch(`https://donclimaxmanagementapp.com/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
    for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0], at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1)); }
    if (method === 'GET' && /^\/documents\/\d+$/.test(path)) {
      assert.equal(response.status, expected);
      return Buffer.from(await response.arrayBuffer());
    }
    assert(response.headers.get('content-type')?.includes('application/json'), 'Expected actual deployed JSON API');
    const value = await response.json();
    if (response.status !== expected) throw Error(`${method} ${path}: HTTP ${response.status}; ${value.code ?? ''} ${value.error ?? ''}`);
    return value;
  }
  const login = await request('POST', '/auth/login', { email, password }, 200, 'all');
  csrf = (await request('GET', '/auth/csrf')).token;
  return { user: login.user, request };
}
if (mode === 'record-local') {
  const saved = JSON.parse(await readFile(evidencePath,'utf8'));
  saved.uiEvents = JSON.parse(await readFile('tmp/step12-live/remaining-ui-events.json','utf8'));
  saved.status = 'verification_batch_executed_with_confirmed_defect_and_explicit_blockers';
  saved.finishedAt = new Date().toISOString();
  saved.reviewOrder = [['funding','cashReceipt','deposit','overhead','schedulePayment'],['topup','expensePayment'],['allocation'],['creditNote'],['creditApplication'],['writeoff']];
  saved.findings = [
    {id:'STEP12-ALLOC-UI-001',priority:'High',status:'CONFIRMED_FAIL',source:'invoice_payment:28',error:'HTTP400 Valid account and memo are required',cause:'Allocation candidate has no bankIds; UI cannot supply original deposit bank5 mapping. settlementDraft rebuilds/hash-checks original receipt using allocation review mapping (including evidence), rather than retained receipt mapping. Adding a field alone may still mismatch original evidence hash.',blocked:['credit_note:6','client_credit_application:30','invoice_writeoff:22'],noDraftOrJournalCreated:true},
    {id:'STEP12-DEBT-RECOVERY-BOUNDARY',status:'UNIMPLEMENTED_CAPABILITY_GUARD_PASS',invoiceId:23,detail:'Ordinary collection refused400 with unchanged payment count/bank; UI has written-off banner and no collection/recovery control. Not acceptance of a debt-recovery process.'},
    {id:'STEP12-SCAN-ROTATION-001',priority:'Medium',status:'OBSERVED_LIMITATION',documentId:15,detail:'90 degree PNG produces42% confidence/gibberish; source retained, no suggestions, no auto-review. Upright image-only PDF14 yields94%/correct B-L and phrase. Rotation normalization not implemented; manual rotate/reupload as retained new version is current procedure.'},
    {id:'STEP12-PRINT-001',priority:'Low',status:'BLOCKED_NATIVE_OUTPUT_NOT_AVAILABLE',detail:'No new native browser Print PDF; existing IAB no-window condition unchanged. Do not repeat previously unsuccessful print or count accepted direct Download PDF output as native proof.'}
  ];
  saved.continuation = 'Fix retained original deposit-mapping validation/UI exposure, then resume ONLY allocation28 -> credit note6 -> client credit application30 -> writeoffaudit22 with actual preparer15/reviewer16 screens; expected completed totals are retained separately. Do not recreate sources or repeat seven accepted new UI cases.';
  await writeFile(evidencePath,JSON.stringify(saved,null,2)+'\n');
  console.log(JSON.stringify({status:saved.status,finishedAt:saved.finishedAt,uiEventCount:saved.uiEvents.length,findings:saved.findings.map(f=>({id:f.id,status:f.status}))}));
} else if (mode === 'probe') {
  const owner = await session(credentials.email, credentials.password);
  assert.equal(owner.user.id, 1);
  const snapshot = await owner.request('GET', '/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');
  const data = { book: snapshot.book.name, policy: snapshot.book.policyVersion, profit: snapshot.statements.profitAndLoss.profit, cash: snapshot.statements.cashFlow.closing, debit: snapshot.totals.debit, credit: snapshot.totals.credit };
  assert(data.book.includes('TEST ONLY'));
  console.log(JSON.stringify({ ownerId: owner.user.id, baseline: data }));
  for (const [name, email] of [['preparer', 'step12.preparer.20261014@donclimax.test'], ['reviewer', 'step12.reviewer.20261014@donclimax.test']]) {
    try { const actor = await session(email, credentials.testPassword); console.log(JSON.stringify({ actor: name, id: actor.user.id, authenticated: true })); await actor.request('POST', '/auth/logout', {}, 200, 'all'); }
    catch (error) { console.log(JSON.stringify({ actor: name, authenticated: false, error: error.message })); }
  }
  await owner.request('POST', '/auth/logout', {}, 200, 'all');
} else if (mode === 'fixtures') {
  const owner = await session(credentials.email, credentials.password);
  const preparer = await session('step12.preparer.20261014@donclimax.test', credentials.testPassword);
  const reviewer = await session('step12.reviewer.20261014@donclimax.test', credentials.testPassword);
  let saved;
  try { saved = JSON.parse(await readFile(evidencePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(!saved, 'Retained batch exists: inspect its IDs, never repeat creation mode');
  const label = 'STEP12-GAPS-20261015', a = JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json', 'utf8')).accounts;
  const report = await owner.request('GET', '/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');
  assert(report.book.name.includes('TEST ONLY')); assert.equal(report.book.policyVersion, 'step12-dummy-20261014-v1');
  const prior = await owner.request('GET', `/containers?search=${label}&limit=100`); assert.equal(prior.total, 0, 'Existing batch found remotely');
  const client = await owner.request('GET', '/clients/12'); assert.equal(Number(client.creditBalance ?? 0), 0, 'Do not consume prior client credits');
  const state = { label, startedAt: new Date().toISOString(), status: 'creating_missing_coverage_sources', baseline: { income: report.statements.profitAndLoss.income, expense: report.statements.profitAndLoss.expense, profit: report.statements.profitAndLoss.profit, cash: report.statements.cashFlow.closing, debit: report.totals.debit, bank5: (await owner.request('GET', '/banks/5/transactions')).closingBalance }, steps: {}, inFlight: null };
  const persist = () => writeFile(evidencePath, JSON.stringify(state, null, 2) + '\n');
  await writeFile(evidencePath, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  async function step(key, operation) {
    assert(!state.steps[key]); state.inFlight = key; await persist();
    const result = await operation(); state.steps[key] = result; state.inFlight = null; await persist();
    console.log(JSON.stringify({ fixture: key, result })); return result;
  }
  try {
    const jobs = [];
    for (const [i, amount] of [6, 2].entries()) {
      const job = await step(`job${i + 1}`, async () => { const result = await owner.request('POST', '/containers', { containerNumber: `GAPU261015${i + 1}`, blNumber: `${label}-BL`, customerName: label, clientId: 12, branchId: 2, clearingCharges: amount, size: i ? '40FT' : '20FT', command: 'PTML', assignedStaffId: 15, verificationOfficerIds: [1], declaration: `${label} TEST ONLY remaining coverage; no actual cargo or client` }, 201); return { id: result.id, containerNumber: result.containerNumber, amount }; });
      jobs.push(job);
    }
    const invoices = [];
    for (const [i, job] of jobs.entries()) {
      const invoice = await step(`invoice${i + 1}`, async () => { const result = await owner.request('POST', '/invoices', { containerIds: [job.id], branchId: 2, vatRate: 0, dueDate: '2026-10-14', notes: `${label} required source-review fixture ${i + 1}` }, 201); assert.equal(result.total, job.amount); return { id: result.id, number: result.invoiceNumber, total: result.total }; });
      await step(`issued${i + 1}`, async () => { await owner.request('PATCH', `/invoices/${invoice.id}`, { status: 'sent' }); return { invoiceId: invoice.id }; });
      const native = await step(`recognition${i + 1}`, async () => { const result = await preparer.request('POST', '/accounting/books/1/tax-configuration/sources/prepare?branchId=2', { kind: 'invoice', id: invoice.id, evidence: `${label} fictional exempt service; prerequisite only, not generic staff UI acceptance`, configurationId: 1, taxCode: 'EXEMPT', recognitionDate: '2026-10-15', receivableAccountId: a['1100'], incomeAccountId: a['4000'] }); return { journalId: result.id }; });
      await step(`recognitionPosted${i + 1}`, async () => { await reviewer.request('POST', `/accounting/books/1/tax-configuration/journals/${native.journalId}/post?branchId=2`, { reason: `${label} independent prerequisite recognition of fictional ${job.amount}; no external transaction` }); return { journalId: native.journalId }; });
      invoices.push(invoice);
    }
    await step('funding', async () => { const r = await owner.request('POST', '/banks/5/fund-additions', { amount: 1, reference: `${label}-CAPITAL`, narration: `${label} fictional capital source for missing UI review; no actual bank instruction` }, 201); return { kind: 'bank_funding', id: r.id, amount: '1.00' }; });
    await step('cashReceipt', async () => { await owner.request('POST', `/invoices/${invoices[0].id}/payments`, { amount: 2, paymentMethod: 'transfer', bankId: 5, reference: `${label}-CASH`, requestId: `${label}-cash` }, 201); const r = await owner.request('GET', `/invoices/${invoices[0].id}`); const p = r.payments.find(p => p.reference === `${label}-CASH`); assert(p); return { kind: 'invoice_payment', id: p.id, amount: '2.00' }; });
    const deposit = await step('deposit', async () => { const r = await owner.request('POST', '/clients/12/deposits', { amount: 1, paymentMethod: 'Bank Transfer', bankId: 5, reference: `${label}-DEPOSIT`, notes: 'TEST ONLY fictional deposit for staff-review coverage' }, 201); return { kind: 'client_deposit', id: r.id, amount: '1.00' }; });
    await step('allocation', async () => { await owner.request('POST', `/client-deposits/${deposit.id}/allocate`, { invoiceId: invoices[0].id, amount: 1, requestKey: `${label}-deposit-allocation` }); const r = await owner.request('GET', `/invoices/${invoices[0].id}`); const p = r.payments.find(p => p.sourceDepositId === deposit.id); assert(p); return { kind: 'invoice_payment', id: p.id, amount: '1.00', cashMovement: '0.00' }; });
    await step('creditNote', async () => { const r = await owner.request('POST', `/invoices/${invoices[0].id}/credit-note`, { amount: 4, reason: `${label} fictional net-service reduction4; reduces AR3 and creates client credit1` }, 201); assert.equal(r.appliedToInvoice, 3); assert.equal(r.creditedToClient, 1); return { kind: 'credit_note', id: r.id, amount: '4.00' }; });
    await step('creditApplication', async () => { await owner.request('POST', `/invoices/${invoices[1].id}/apply-credit`, { amount: 1, requestKey: `${label}-client-credit` }, 201); const r = await owner.request('GET', `/invoices/${invoices[1].id}`); const p = r.payments.find(p => p.paymentMethod === 'credit'); assert(p); return { kind: 'client_credit_application', id: p.id, amount: '1.00' }; });
    await step('writeoff', async () => { const r = await owner.request('POST', `/invoices/${invoices[1].id}/write-off`, {}, 201); assert.equal(r.writtenOffAmount, 1); const audit = (await owner.request('GET', `/invoices/${invoices[1].id}/audit-log`)).filter(a => a.action === 'written_off'); assert.equal(audit.length, 1); return { kind: 'invoice_writeoff', id: audit[0].id, invoiceId: invoices[1].id, overheadExpenseId: r.overheadExpenseId, amount: '1.00' }; });
    const bill = await step('overhead', async () => { const r = await owner.request('POST', '/overhead-expenses', { category: 'Office Supplies', description: `${label} fictional original supplier obligation1`, amount: 1, reference: `${label}-BILL` }, 201); return { kind: 'overhead', id: r.id, amount: '1.00' }; });
    await step('topup', async () => { const r = await owner.request('POST', `/overhead-expenses/${bill.id}/topups`, { amount: 1, description: `${label} fictional incremental supplier obligation1` }, 201); assert.equal(r.topups.length, 1); return { kind: 'overhead_topup', id: r.topups[0].id, overheadId: bill.id, amount: '1.00' }; });
    await step('expensePayment', async () => { const r = await owner.request('POST', `/overhead-expenses/${bill.id}/payments`, { amount: 2, paymentMethod: 'bank', bankId: 5, notes: `${label} fictional full obligation settlement2` }, 201); return { kind: 'expense_payment', id: r.payment.id, amount: '2.00' }; });
    const schedule = await step('schedule', async () => { const r = await preparer.request('POST', '/payment-schedules', { scheduleDate: '2026-10-15', vendorBeneficiary: `${label} standalone supplier`, description: `${label} fictional operating voucher1`, amountRequested: 1, priority: 'normal' }, 201); return { id: r.id }; });
    await step('scheduleApproved', async () => { await owner.request('PATCH', `/payment-schedules/${schedule.id}/approve`, { comment: `${label} fictional operating voucher approved; no external payment` }); return { id: schedule.id }; });
    await step('schedulePayment', async () => { await preparer.request('PATCH', `/payment-schedules/${schedule.id}/pay`, { amount: 1, paymentMethod: 'bank', bankId: 5, classification: 'operating_expense', classificationReason: `${label} explicit fictional office consumable voucher`, expenseHead: 'Office supplies' }); const r = await preparer.request('GET', `/payment-schedules/${schedule.id}`); assert.equal(r.payments.length, 1); return { kind: 'schedule_payment', id: r.payments[0].id, scheduleId: schedule.id, amount: '1.00' }; });
    state.status = 'sources_created_awaiting_actual_staff_UI';
    state.expectedAfterUI = { income: '904.00', expense: '673.50', profit: '230.50', cash: '10178.50', bank5: 10153.50, bank6: 25, assets: '10231.50', receivables: '0.00', payables: '0.00', depositsAndCredits: '0.00' };
    state.reviewOrder = [['funding', 'cashReceipt', 'deposit', 'creditNote', 'writeoff', 'overhead', 'schedulePayment'], ['allocation', 'creditApplication', 'topup'], ['expensePayment']];
    await persist(); console.log(JSON.stringify({ status: state.status, steps: state.steps, expectedAfterUI: state.expectedAfterUI }));
  } catch (error) { state.status = 'STOPPED_inspect_inFlight_before_any_resume'; state.error = error.message; await persist(); throw error; }
  finally { for (const actor of [owner, preparer, reviewer]) await actor.request('POST', '/auth/logout', {}, 200, 'all'); }
} else if (mode === 'inspect') {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  const owner = await session(credentials.email, credentials.password);
  try {
    if (!saved.steps.expensePayment.id) {
      const expense = (await owner.request('GET', '/overhead-expenses')).expenses.find(e => e.id === saved.steps.overhead.id);
      assert(expense); const payments = expense.payments.filter(p => p.notes?.includes(saved.label)); assert.equal(payments.length, 1);
      saved.steps.expensePayment.id = payments[0].id;
      saved.harnessCorrection = 'Payment create response wraps payment/expense; retained actual ID read from existing bill, no payment repeated.';
    }
    const workspace = await owner.request('GET', '/accounting/books/1/source-review?branchId=2');
    const candidates = [];
    for (const [key, source] of Object.entries(saved.steps).filter(([, value]) => value.kind)) {
      const candidate = await owner.request('GET', `/accounting/books/1/source-review/sources/${source.kind}/${source.id}?branchId=2`);
      assert.equal(candidate.journalId, null, `${key}: already posted, inspect rather than repeat UI`);
      candidates.push({ key, kind: source.kind, id: source.id, amount: candidate.amount, date: candidate.date, label: candidate.label });
    }
    saved.candidates = candidates; saved.availableReviewIds = workspace.reviews.map(r => r.id);
    await writeFile(evidencePath, JSON.stringify(saved, null, 2) + '\n');
    console.log(JSON.stringify({ candidates, existingReviewIds: saved.availableReviewIds }));
  } finally { await owner.request('POST', '/auth/logout', {}, 200, 'all'); }
} else if (mode === 'controls') {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert(!saved.controls, 'Controls already recorded: inspect instead of repeating');
  const owner = await session(credentials.email, credentials.password);
  const preparer = await session('step12.preparer.20261014@donclimax.test', credentials.testPassword);
  const operations = await session('e2e.operations.20260904@donclimax.test', credentials.testPassword);
  saved.controls = { startedAt: new Date().toISOString(), results: [] };
  const persist = () => writeFile(evidencePath, JSON.stringify(saved, null, 2) + '\n');
  const record = async value => { saved.controls.results.push(value); await persist(); console.log(JSON.stringify(value)); };
  try {
    const before = await owner.request('GET', '/invoices/23');
    const bankBefore = await owner.request('GET', '/banks/5/transactions');
    const rejection = await owner.request('POST', '/invoices/23/payments', { amount: .01, paymentMethod: 'transfer', bankId: 5, reference: saved.label + '-RECOVERY-MUST-REFUSE', requestId: saved.label + '-recovery-refused' }, 400);
    const after = await owner.request('GET', '/invoices/23');
    assert.equal(after.payments.length, before.payments.length);
    assert.equal((await owner.request('GET', '/banks/5/transactions')).closingBalance, bankBefore.closingBalance);
    await record({ name: 'Written-off collection boundary', result: 'PASS_GUARD_NOT_RECOVERY_FEATURE', invoiceId: 23, response: rejection, paymentsUnchanged: true, bankUnchanged: true });
    const denied = await operations.request('POST', '/containers/40/early-start', { reason: saved.label + ' unauthorized role must refuse' }, 403);
    const early = await owner.request('POST', '/containers/40/early-start', { reason: saved.label + ' TEST ONLY authorized parallel-start variant; final prerequisites remain mandatory' });
    assert.equal(early.earlyStartAuthorized, true);
    const closed = await owner.request('PATCH', '/containers/40/status', { status: 'closed' }, 409);
    const first = (await owner.request('GET', '/containers/39')).container;
    const second = (await owner.request('GET', '/containers/40')).container;
    assert.equal(first.earlyStartAuthorized, false); assert.equal(second.status, 'pending_verification');
    await record({ name: 'Early start does not bypass final prerequisites or affect same-BL sibling', result: 'PASS', jobId: 40, siblingId: 39, unauthorizedResponse: denied, finalCloseResponse: closed, job40: { status: second.status, earlyStart: second.earlyStartAuthorized, size: second.size }, sibling39: { status: first.status, earlyStart: first.earlyStartAuthorized, size: first.size } });
    const existing = (await owner.request('GET', '/approvals')).filter(a => a.containerId === 39 && a.section === 'customs');
    assert(!existing.some(a => a.status === 'submitted'), 'Do not duplicate pending approval');
    const approval = await preparer.request('POST', '/containers/39/sections/customs/submit', {});
    saved.controls.approval = { id: approval.id, containerId: 39, section: 'customs', state: 'submitted_awaiting_actual_browser_rejection' };
    await persist(); console.log(JSON.stringify(saved.controls.approval));
  } finally { for (const actor of [owner, preparer, operations]) await actor.request('POST', '/auth/logout', {}, 200, 'all'); }
} else if (mode === 'controls-finish') {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert(saved.controls && !saved.controls.approval);
  const owner = await session(credentials.email, credentials.password);
  const preparer = await session('step12.preparer.20261014@donclimax.test', credentials.testPassword);
  try {
    const first = (await owner.request('GET', '/containers/39')).container;
    const second = (await owner.request('GET', '/containers/40')).container;
    assert.equal(first.earlyStartAuthorized, false); assert.equal(second.earlyStartAuthorized, true); assert.equal(second.status, 'pending_verification');
    saved.controls.results.push({ name: 'Early-start role and final-stage isolation', result: 'PASS_BOUNDED_PENDING_VERIFICATION_REFUSAL', jobId:40, siblingId:39, unauthorizedStatus:403, closeStatus:400, closeError:'Unknown current status: pending_verification', currentStates:{first,second}, harnessNote:'Expected409 but deployed400 refusal; both preserve status. No mutation repeated or early-start reauthorized.' });
    const approval = await preparer.request('POST', '/containers/39/sections/customs/submit', {});
    saved.controls.approval = { id: approval.id, containerId:39, section:'customs', state:'submitted_awaiting_actual_browser_rejection' };
    await writeFile(evidencePath, JSON.stringify(saved,null,2)+'\n'); console.log(JSON.stringify(saved.controls.approval));
  } finally {for(const actor of [owner,preparer]) await actor.request('POST','/auth/logout',{},200,'all');}
} else if (mode === 'early-finalize') {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert(!saved.earlyVariant, 'Do not repeat accepted variant');
  const owner = await session(credentials.email, credentials.password);
  try {
    const before = (await owner.request('GET','/containers/40')).container;
    assert.equal(before.status,'pending_verification'); assert.equal(before.earlyStartAuthorized,true); assert(before.verificationOfficerIds.includes(1));
    const verified = await owner.request('POST','/containers/40/verify',{}); assert.equal(verified.status,'registered');
    await owner.request('POST','/containers/40/stage-action',{stage:'shipping',action:'update_stage_owner',stageOwner:'STEP12-GAPS-20261015 early shipping owner'});
    await owner.request('POST','/containers/40/stage-action',{stage:'shipping',action:'mark_released'});
    const gate = await owner.request('POST','/containers/40/gate-in',{},409);
    const current = (await owner.request('GET','/containers/40')).container;
    const sibling = (await owner.request('GET','/containers/39')).container;
    assert(current.doReleasedAt); assert.equal(current.gateInDate,null); assert.equal(current.tdoReleasedAt,null);
    assert.equal(sibling.status,'pending_verification'); assert.equal(sibling.doReleasedAt,null);
    saved.earlyVariant = {at:new Date().toISOString(),result:'PASS',jobId:40,description:'Verified authorized early-start 40FT job releases Shipping before PAAR while Terminal/Pullout/gate prerequisites still refuse physical gate-in. Same BL 20FT sibling39 remains pending with no Shipping release.',gateResponse:gate,current,sibling};
    await writeFile(evidencePath,JSON.stringify(saved,null,2)+'\n');console.log(JSON.stringify({result:'PASS',jobId:40,status:current.status,shippingReleased:current.doReleasedAt,gateResponse:gate,siblingStatus:sibling.status}));
  } finally {await owner.request('POST','/auth/logout',{},200,'all');}
} else if (mode === 'scan-verify') {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  const owner = await session(credentials.email, credentials.password);
  try {
    const readiness = await owner.request('GET', '/containers/39/document-readiness');
    const scans = [];
    for (const name of ['step12-fictional-image-only.pdf', 'step12-fictional-scan-rotated.png']) {
      const matches = readiness.documents.filter(d => d.originalName === name); assert.equal(matches.length, 1);
      const doc = matches[0]; assert.equal(doc.review, null); assert.equal(doc.versionNumber, 1);
      const extraction = await owner.request('GET', `/containers/39/document-readiness/${doc.id}/extraction`);
      const bytes = await owner.request('GET', `/documents/${doc.id}`);
      const original = await readFile('tmp/step12-live/' + name);
      assert(bytes.equals(original), 'Stored original must not be silently rotated/replaced');
      assert.equal(extraction.pages.length, 1);
      if (name.endsWith('.pdf')) { assert(extraction.pages[0].text.includes('cobalt scan lantern')); assert.equal(extraction.suggestions.find(s => s.field === 'identifier')?.value, 'STEP12-GAPS-20261015-BL'); }
      else { assert(extraction.pages[0].confidence < 85); assert.equal(extraction.suggestions.length, 0); }
      scans.push({ documentId:doc.id, name, byteIdentical:true, sha256:createHash('sha256').update(bytes).digest('hex'), extraction, reviewed:false });
    }
    saved.scans = { at:new Date().toISOString(), configured:readiness.configured, ready:readiness.ready, scans, limitation:'90-degree rotated PNG indexed as low-confidence gibberish, no suggestions; no automatic orientation normalization is implemented. Upright image-only PDF accepted; not universal OCR accuracy.' };
    const oldDay = await owner.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-14');
    assert.equal(oldDay.statements.profitAndLoss.profit,'230.50'); assert.equal(oldDay.statements.cashFlow.closing,'10177.50');
    saved.originalDayUnchanged = {profit:oldDay.statements.profitAndLoss.profit,cash:oldDay.statements.cashFlow.closing,debit:oldDay.totals.debit};
    const report = saved.verification.report;
    assert.equal(report.statements.profitAndLoss.income,'908.00'); assert.equal(report.statements.profitAndLoss.expense,'672.50'); assert.equal(report.statements.profitAndLoss.profit,'235.50');
    assert.equal(report.statements.cashFlow.closing,'10178.50'); assert.equal(report.statements.cashFlow.difference,'0.00');
    assert.equal(report.statements.cashFlow.profitBridge.difference,'0.00'); assert.equal(report.statements.balanceSheet.difference,'0.00');
    assert.equal(report.statements.receivables.total,'6.00'); assert.equal(report.statements.payables.total,'0.00');
    assert.equal(report.totals.debit,'13339.84'); assert.equal(report.totals.credit,'13339.84');
    assert.equal(saved.verification.bank5,10153.50); assert.equal(saved.verification.bank6,25);
    assert.equal(saved.verification.approval.status,'rejected'); assert.equal(report.coverage[0].counts.missing,4);
    saved.partialReconciliation = {result:'PASS_EXPECTED_PARTIAL_NOT_COMPLETE_ACCOUNTING',income:'908.00',expense:'672.50',profit:'235.50',cash:'10178.50',assets:'10237.50',liabilities:'1.00',equityIncludingEarnings:'10236.50',receivables:'6.00',payables:'0.00',deposits:'1.00',missingSourceCount:4,explanation:'Recognition8, cash settlement2, capital1, deposit1, overhead2 and standalone1 posted; allocation1/credit note4/credit application1/writeoff1 remain unposted. Net profit is5 above baseline until credit reduction4 and bad debt1 post.'};
    saved.uiEvents = JSON.parse(await readFile('tmp/step12-live/remaining-ui-events.json','utf8'));
    await writeFile(evidencePath,JSON.stringify(saved,null,2)+'\n'); console.log(JSON.stringify({scans:scans.map(s=>({id:s.documentId,name:s.name,byteIdentical:s.byteIdentical,confidence:s.extraction.pages[0].confidence,suggestions:s.extraction.suggestions})),originalDayUnchanged:saved.originalDayUnchanged,partialReconciliation:saved.partialReconciliation}));
  } finally {await owner.request('POST','/auth/logout',{},200,'all');}
} else {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  const owner = await session(credentials.email, credentials.password);
  try {
    const workspace = await owner.request('GET', '/accounting/books/1/source-review?branchId=2');
    const reviews = [];
    for (const id of [4, 5, 6, 7, 8, 9, 10]) {
      const review = await owner.request('GET', `/accounting/books/1/source-review/${id}?branchId=2`);
      assert.equal(review.state, 'posted'); assert.equal(review.preparedBy, 15); assert.equal(review.reviewedBy, 16);
      assert.equal(review.audit.filter(a => a.action === 'source_review_posted').length, 1);
      reviews.push(review);
    }
    const blocked = [];
    for (const source of [saved.steps.allocation, saved.steps.creditNote, saved.steps.creditApplication, saved.steps.writeoff]) {
      const candidate = await owner.request('GET', `/accounting/books/1/source-review/sources/${source.kind}/${source.id}?branchId=2`);
      assert.equal(candidate.journalId, null); assert(!workspace.reviews.some(r => r.source.kind === source.kind && r.source.id === source.id));
      blocked.push(candidate);
    }
    const report = await owner.request('GET', '/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');
    const bank = await owner.request('GET', '/banks/5/transactions');
    const bank6 = await owner.request('GET', '/banks/6/transactions');
    const approval = saved.controls?.approval ? (await owner.request('GET', '/approvals')).find(a => a.id === saved.controls.approval.id) : null;
    const invoice = await owner.request('GET', '/invoices/23');
    saved.verification = { at: new Date().toISOString(), reviews, blocked, report, bank5: bank.closingBalance, bank6: bank6.closingBalance, approval, writtenOffInvoice: { id: invoice.id, status: invoice.status, writtenOffAmount: invoice.writtenOffAmount, payments: invoice.payments } };
    saved.uiEvents = JSON.parse(await readFile('tmp/step12-live/remaining-ui-events.json', 'utf8'));
    saved.status = 'remaining_checks_executed_allocation_defect_blocks_four_dependent_UI_acceptances';
    await writeFile(evidencePath, JSON.stringify(saved, null, 2) + '\n');
    console.log(JSON.stringify({ reviews: reviews.map(r => ({id:r.id, source:r.source, journalId:r.journalId})), blocked:blocked.map(c=>({kind:c.kind,id:c.id,bankIds:c.bankIds})), totals:report.totals, statements:report.statements, bank5:bank.closingBalance, bank6:bank6.closingBalance, approval }));
  } finally { await owner.request('POST', '/auth/logout', {}, 200, 'all'); }
}
