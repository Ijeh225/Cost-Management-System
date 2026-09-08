// One-off, evidence-bound repair. Never call the normal pay route for an already-paid schedule.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { Client } = createRequire(new URL('../lib/db/package.json', import.meta.url))('pg');
const mode = process.argv[2];
assert(['--inspect', '--rehearse', '--apply', '--verify'].includes(mode), 'Choose an explicit mode');
const reference = 'LEGACY-RECON-SCHED-7-20260908';
const vendor = 'E2E-20260901 Scheduled Test Vendor';
const bankName = 'E2E-20260901 Lagos Test Bank';
const timestamp = '2026-09-01 16:49:12.876633';
const note = 'Historical reconstruction authorised by Owner on 2026-09-08, not a new payment. '
  + 'Source: schedule 7 Paid event 22 (NGN500, actor 1); paid_at copied from that event, '
  + 'not independently verified bank settlement time. Bank 3 is supported by the 2026-09-01 '
  + 'SCHED-01/BANK-01 live-test record. Original bank reference was not retained; '
  + reference + ' is a reconciliation identifier, not an original bank reference. '
  + 'Schedule amount_paid/status and original events are unchanged.';
const url = new URL(process.env.RECON_DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1', 'Only the explicitly opened SSH tunnel is allowed');
assert.equal(url.port, mode === '--rehearse' ? '54339' : '54340');
const database = mode === '--rehearse' ? 'cost_management_integration_test' : 'railway';
assert.equal(url.pathname, '/' + database);
if (mode === '--apply') assert.equal(process.argv[3], 'LEGACY-SCHEDULE-7-500-20260908');
const client = new Client({ connectionString: url.href });
const backupPath = root + 'docs/evidence/2026-09-08-schedule-7-before.json';

async function snapshot() {
  return {
    schedule: (await client.query('select * from payment_schedules where id=7')).rows,
    events: (await client.query('select *,created_at::text as original_created_at from payment_schedule_events where schedule_id=7 order by id')).rows,
    payments: (await client.query('select * from payment_schedule_payments where schedule_id=7 order by id')).rows,
  };
}

async function repair() {
  const s = (await client.query('select * from payment_schedules where id=7 for update')).rows[0];
  assert(s, 'Missing source schedule');
  assert.equal(s.vendor_beneficiary, vendor);
  assert.equal(s.branch_id, 2);
  assert.equal(s.requested_by_id, 1);
  assert.equal(s.status, 'paid');
  assert.equal(s.overhead_expense_id, null);
  for (const field of ['amount_requested', 'amount_approved', 'amount_paid']) assert.equal(s[field], '500.00');
  const bank = (await client.query('select name,branch_id from banks where id=3 for update')).rows[0];
  assert.deepEqual(bank, {name: bankName, branch_id: 2});
  const actor = (await client.query('select id,is_active from users where id=1')).rows[0];
  assert.deepEqual(actor, {id: 1, is_active: true});
  const paid = (await client.query("select id,branch_id,amount,actor_user_id,created_at::text as date from payment_schedule_events where schedule_id=7 and type='paid' order by id")).rows;
  assert.deepEqual(paid, [{id:22,branch_id:2,amount:'500.00',actor_user_id:1,date:timestamp}]);
  assert.equal((await client.query('select id from expense_payments where payment_schedule_id=7')).rowCount, 0);
  const rows = (await client.query('select *,paid_at::text as original_paid_at from payment_schedule_payments where schedule_id=7 or reference=$1 for update', [reference])).rows;
  if (rows.length) {
    assert.equal(rows.length, 1, 'Multiple payment facts: stop for review');
    const p = rows[0];
    assert.equal(p.schedule_id, 7); assert.equal(p.branch_id, 2);
    assert.equal(p.bank_id, 3); assert.equal(p.amount, '500.00');
    assert.equal(p.payment_method, 'bank'); assert.equal(p.reference, reference);
    assert.equal(p.original_paid_at, timestamp); assert.equal(p.notes, note);
    assert.equal((await client.query("select id from payment_schedule_events where schedule_id=7 and type='comment' and comment=$1", [note])).rowCount, 1);
    return {status:'already_reconciled', paymentId:p.id};
  }
  const [p] = (await client.query(`insert into payment_schedule_payments
    (branch_id,schedule_id,amount,payment_method,bank_id,reference,notes,paid_at,recorded_by)
    select 2,7,amount,'bank',3,$1,$2,created_at,1 from payment_schedule_events where id=22 and schedule_id=7
    returning id`, [reference,note])).rows;
  await client.query(`insert into payment_schedule_events
    (branch_id,schedule_id,type,actor_user_id,comment,old_status,new_status)
    values(2,7,'comment',1,$1,'paid','paid')`, [note]);
  return {status:'reconciled',paymentId:p.id};
}

await client.connect();
try {
  assert.equal((await client.query('select current_database() as name')).rows[0].name, database);
  await client.query(['--inspect','--verify'].includes(mode) ? 'BEGIN READ ONLY' : 'BEGIN');
  if (mode === '--rehearse') {
    for (const table of ['branches','users','banks','payment_schedules','payment_schedule_events','payment_schedule_payments']) {
      assert.equal((await client.query('select count(*)::int as n from '+table)).rows[0].n,0,'Isolated fixture table must be empty: '+table);
    }
    await client.query("insert into branches(id,name) values(2,'Legacy repair rehearsal')");
    await client.query("insert into users(id,branch_id,name,email,password_hash,role) values(1,2,'Rehearsal owner','legacy-rehearsal@example.test','not-a-login-hash','super_admin')");
    await client.query('insert into banks(id,name,branch_id) values(3,$1,2)', [bankName]);
    await client.query(`insert into payment_schedules(id,branch_id,schedule_date,requested_by_id,vendor_beneficiary,description,amount_requested,amount_approved,amount_paid,status)
      values(7,2,'2026-09-01',1,$1,'Isolated historical-repair fixture',500,500,500,'paid')`, [vendor]);
    await client.query(`insert into payment_schedule_events(id,branch_id,schedule_id,type,actor_user_id,amount,created_at)
      values(22,2,7,'paid',1,500,$1)`, [timestamp]);
    const before = await snapshot();
    await client.query('SAVEPOINT invalid_amount');
    await client.query('update payment_schedules set amount_paid=499 where id=7');
    await assert.rejects(repair);
    assert.equal((await client.query('select id from payment_schedule_payments')).rowCount,0);
    await client.query('ROLLBACK TO SAVEPOINT invalid_amount');
    const first = await repair();
    assert.equal(first.status,'reconciled');
    const second = await repair();
    assert.equal(second.status,'already_reconciled');
    assert.equal(second.paymentId,first.paymentId);
    const after = await snapshot();
    assert.deepEqual(after.schedule,before.schedule);
    assert.equal(after.payments.length,1);
    assert.equal(after.events.length,before.events.length+1);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({status:'rehearsal_passed',checks:['invalid amount blocked','single immutable payment','repeat is no-op','schedule unchanged','one trace comment','fixtures rolled back']}));
  } else if (mode === '--inspect') {
    const before = await snapshot();
    assert.equal(before.schedule[0]?.vendor_beneficiary,vendor);
    mkdirSync(root+'docs/evidence',{recursive:true});
    if (!existsSync(backupPath)) writeFileSync(backupPath,JSON.stringify(before,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'inspected',snapshot:before}));
    await client.query('ROLLBACK');
  } else if (mode === '--verify') {
    const after = await snapshot();
    const before = JSON.parse(readFileSync(backupPath,'utf8'));
    assert.deepEqual(JSON.parse(JSON.stringify(after.schedule)), before.schedule);
    assert.deepEqual(JSON.parse(JSON.stringify(after.events.filter(e => before.events.some(b => b.id === e.id)))), before.events);
    assert.equal(after.events.length,before.events.length+1);
    assert.equal(after.events.filter(e => e.type==='comment' && e.comment===note).length,1);
    assert.equal(after.payments.length,1);
    const p=after.payments[0];
    assert.equal(p.amount,'500.00'); assert.equal(p.bank_id,3);
    assert.equal(p.reference,reference); assert.equal(p.notes,note);
    assert.equal((await client.query('select p.id from payment_schedule_payments p join payment_schedule_events e on e.id=22 where p.id=$1 and p.paid_at=e.created_at',[p.id])).rowCount,1);
    const path=root+'docs/evidence/2026-09-08-schedule-7-after.json';
    if (!existsSync(path)) writeFileSync(path,JSON.stringify(after,null,2)+'\n',{flag:'wx'});
    await client.query('ROLLBACK');
    console.log(JSON.stringify({status:'verification_passed',paymentId:p.id,originalScheduleAndEventsUnchanged:true,paymentCount:1,traceComments:1,paidTimestampCopiedExactly:true}));
  } else {
    await client.query('select id from payment_schedules where id=7 for update');
    const before = await snapshot();
    const backup = JSON.parse(readFileSync(backupPath,'utf8'));
    // Exact snapshot comparison prevents applying to a record changed since inspection.
    if (!before.payments.length) assert.deepEqual(JSON.parse(JSON.stringify(before)),backup);
    const result = await repair();
    const after = await snapshot();
    assert.deepEqual(after.schedule,before.schedule);
    assert.equal(after.payments.length,1);
    await client.query('COMMIT');
    console.log(JSON.stringify({...result,scheduleUnchanged:true,payment:after.payments[0]}));
  }
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Reconciliation stopped:', error.message);
  process.exitCode=1;
} finally {
  await client.end();
}
