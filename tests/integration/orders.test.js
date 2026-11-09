import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, loginAs, DEMO, po, milestone } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('creating an order copies the template milestones with dates and floors', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [buyer] } = await pool.query("SELECT id FROM buyers WHERE name = 'Company B'");
  const { rows: [template] } = await pool.query("SELECT id FROM templates WHERE name = 'Basic tee'");
  const { rows: floors } = await pool.query('SELECT id, name FROM floors ORDER BY id');
  const res = await agent.post('/orders').type('form').send({
    _csrf: csrf,
    poNumber: 'B-PO-99001', buyerId: buyer.id, style: 'Test tee', exFactoryDate: '2026-12-20', templateId: template.id,
    'sizes[0]': 'S', 'sizes[1]': 'M', 'colours[0]': 'Navy', 'colours[1]': 'White',
    'qty[0][0]': '100', 'qty[0][1]': '200', 'qty[1][0]': '50', 'qty[1][1]': '',
    'floors[Cutting]': floors[3].id, 'floors[Stitching]': floors[0].id, 'floors[Finishing]': floors[4].id, 'floors[Packing]': floors[5].id,
  });
  assert.equal(res.status, 302, res.text.slice(0, 300));
  const order = await po(pool, 'B-PO-99001');
  assert.ok(order);
  const { rows: lines } = await pool.query('SELECT colour, size, quantity FROM order_lines WHERE order_id = $1 ORDER BY id', [order.id]);
  assert.deepEqual(lines, [
    { colour: 'Navy', size: 'S', quantity: 100 }, { colour: 'Navy', size: 'M', quantity: 200 }, { colour: 'White', size: 'S', quantity: 50 },
  ]);
  const { rows: ms } = await pool.query('SELECT name, kind, planned_start, planned_end, floor_id, target_qty FROM order_milestones WHERE order_id = $1 ORDER BY seq', [order.id]);
  assert.equal(ms.length, 9);
  assert.deepEqual(ms[0], { name: 'Order confirmation', kind: 'date', planned_start: null, planned_end: '2026-10-21', floor_id: null, target_qty: null });
  assert.deepEqual(ms[5], { name: 'Stitching', kind: 'quantity', planned_start: '2026-11-20', planned_end: '2026-12-14', floor_id: floors[0].id, target_qty: 350 });
  const detail = await agent.get(`/orders/${order.id}`);
  assert.equal(detail.status, 200);
  assert.match(detail.text, /B-PO-99001/);
});

test('a duplicate PO number or a missing floor re-renders the form with inline errors', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [buyer] } = await pool.query("SELECT id FROM buyers WHERE name = 'Company B'");
  const { rows: [template] } = await pool.query("SELECT id FROM templates WHERE name = 'Basic tee'");
  const res = await agent.post('/orders').type('form').send({
    _csrf: csrf, poNumber: 'B-PO-88213', buyerId: buyer.id, style: 'Dup', exFactoryDate: '2026-12-20', templateId: template.id,
    'sizes[0]': 'S', 'colours[0]': 'Navy', 'qty[0][0]': '10',
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /already exists/);
  assert.match(res.text, /Choose a floor/);
});

test('changing the ex-factory date needs a reason and writes the history', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const order = await po(pool, 'B-PO-88251');
  const noReason = await agent.post(`/orders/${order.id}/ex-factory`).type('form').send({ _csrf: csrf, newDate: '2026-11-30', reason: '' });
  assert.equal(noReason.status, 302);
  let changes = await pool.query("SELECT * FROM date_changes WHERE order_id = $1 AND field = 'ex_factory'", [order.id]);
  assert.equal(changes.rows.length, 0);
  assert.equal((await po(pool, 'B-PO-88251')).ex_factory_date, '2026-11-26');

  const ok = await agent.post(`/orders/${order.id}/ex-factory`).type('form').send({ _csrf: csrf, newDate: '2026-11-30', reason: 'Buyer moved the vessel booking' });
  assert.equal(ok.status, 302);
  assert.equal((await po(pool, 'B-PO-88251')).ex_factory_date, '2026-11-30');
  changes = await pool.query("SELECT * FROM date_changes WHERE order_id = $1 AND field = 'ex_factory'", [order.id]);
  assert.equal(changes.rows.length, 1);
  assert.equal(changes.rows[0].old_value, '2026-11-26');
  assert.equal(changes.rows[0].new_value, '2026-11-30');
  assert.equal(changes.rows[0].reason, 'Buyer moved the vessel booking');
});

test('editing a planned date and marking a milestone done are both logged', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const m = await milestone(pool, 'C-PO-0495', 'PP sample approval');
  const res = await agent.post(`/orders/${m.order_id}/milestones/${m.id}/planned`).type('form').send({ _csrf: csrf, plannedEnd: '2026-11-06', reason: 'Buyer confirmed approval call on 6 Nov' });
  assert.equal(res.status, 302);
  const done = await agent.post(`/orders/${m.order_id}/milestones/${m.id}/done`).type('form').send({ _csrf: csrf, actualDate: '2026-11-04' });
  assert.equal(done.status, 302);
  const { rows } = await pool.query('SELECT field, old_value, new_value FROM date_changes WHERE order_milestone_id = $1 ORDER BY id', [m.id]);
  assert.deepEqual(rows, [
    { field: 'planned_end', old_value: '2026-10-30', new_value: '2026-11-06' },
    { field: 'actual_date', old_value: null, new_value: '2026-11-04' },
  ]);
  // The order is no longer red from that milestone. Its cutting stage is past its planned
  // start with no entries, so it is stale-amber and the open warning is updated, not resolved.
  const { rows: [w] } = await pool.query('SELECT status, level FROM warnings WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [m.order_id]);
  assert.deepEqual(w, { status: 'detected', level: 'amber' });
});

test('the date-change history cannot be edited or deleted', async () => {
  await assert.rejects(pool.query('DELETE FROM date_changes'), /append-only/);
  await assert.rejects(pool.query("UPDATE date_changes SET reason = 'x'"), /append-only/);
});
