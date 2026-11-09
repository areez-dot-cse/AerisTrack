// The warning lifecycle end to end: detected → confirmed / dismissed → resolved,
// and a worse level after a decision opens a new warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createTestApp, loginAs, DEMO, po, milestone } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

const supervisorF5 = { phone: '9000000005', pin: '1234' }; // Unit 3 · Floor 1, finishing for B-PO-88240

const postEntry = (agent, csrf, fields) => {
  const req = agent.post('/api/s/entries').set('X-CSRF-Token', csrf).set('Accept', 'application/json');
  for (const [k, v] of Object.entries(fields)) req.field(k, String(v));
  return req;
};
const warningsFor = async (orderId) => (await pool.query('SELECT level, status, snapshot FROM warnings WHERE order_id = $1 ORDER BY id', [orderId])).rows;

test('confirming freezes the maths, and recovery resolves the warning so the buyer stops seeing it', async () => {
  const office = await loginAs(app, DEMO.merchandiser);
  const order = await po(pool, 'B-PO-88213');
  const [detected] = await warningsFor(order.id);
  assert.equal(detected.status, 'detected');
  const { rows: [w] } = await pool.query("SELECT id FROM warnings WHERE order_id = $1 AND status = 'detected'", [order.id]);
  await office.agent.post(`/review/warnings/${w.id}/confirm`).type('form').send({ _csrf: office.csrf, reasonCategory: 'MACHINE_BREAKDOWN', noteForBuyer: 'Mechanic due tomorrow' });
  let [confirmed] = await warningsFor(order.id);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.snapshot.projection.neededPerDay, 578);
  assert.equal(confirmed.snapshot.projection.expectedFinish, '2026-11-17');
  assert.match((await request(app).get(`/b/${DEMO.tokenB}/orders/${order.id}`)).text, /Mechanic due tomorrow/);

  // The floor recovers: 40 machines at 600/day finishes on the deadline.
  const floor = await loginAs(app, DEMO.supervisorF1);
  const stitching = await milestone(pool, 'B-PO-88213', 'Stitching');
  const res = await postEntry(floor.agent, floor.csrf, { stageId: stitching.id, pieces: 600, machines: 40, clientUuid: crypto.randomUUID() });
  assert.equal(res.status, 200, res.text);
  [confirmed] = await warningsFor(order.id);
  assert.equal(confirmed.status, 'resolved');
  assert.doesNotMatch((await request(app).get(`/b/${DEMO.tokenB}/orders/${order.id}`)).text, /Mechanic due tomorrow/);
});

test('after a dismissal the same level stays quiet, but a worse level opens a new warning', async () => {
  const office = await loginAs(app, DEMO.merchandiser);
  const order = await po(pool, 'B-PO-88240');
  const { rows: [w] } = await pool.query("SELECT id FROM warnings WHERE order_id = $1 AND status = 'detected'", [order.id]);
  await office.agent.post(`/review/warnings/${w.id}/dismiss`).type('form').send({ _csrf: office.csrf, reason: 'Two more tables from tomorrow' });
  const { refreshWarning } = await import('../../src/services/warnings.js');
  await refreshWarning(order.id);
  assert.deepEqual((await warningsFor(order.id)).map((x) => x.status), ['dismissed']);

  // The finishing floor stops: amber becomes red, so a new warning is detected.
  const floor = await loginAs(app, supervisorF5);
  const finishing = await milestone(pool, 'B-PO-88240', 'Finishing');
  const res = await postEntry(floor.agent, floor.csrf, { stageId: finishing.id, pieces: 0, machines: 0, clientUuid: crypto.randomUUID() });
  assert.equal(res.status, 200, res.text);
  const rows = await warningsFor(order.id);
  assert.deepEqual(rows.map((x) => [x.level, x.status]), [['amber', 'dismissed'], ['red', 'detected']]);
  assert.equal(rows[1].snapshot.projection.state, 'STOPPED');
});

test('the review inbox prefills the reason from the latest note on the headline stage', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const page = await agent.get('/review?tab=warnings');
  // D-PO-3310's stitching note is a power cut; the select for that warning has it chosen.
  const card = page.text.slice(page.text.indexOf('D-PO-3310'));
  assert.match(card.slice(0, 4000), /<option value="POWER_CUT" selected>/);
});
