import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, loginAs, DEMO } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('seed sanity: the board counts are 3 red, 2 amber, 6 green, 2 grey and the brief orders project as designed', async () => {
  const { loadSummaries } = await import('../../src/services/orderSummary.js');
  const orders = await loadSummaries();
  const counts = {};
  for (const o of orders) counts[o.level] = (counts[o.level] ?? 0) + 1;
  assert.deepEqual(counts, { red: 3, amber: 2, green: 6, grey: 2 });

  const byPo = Object.fromEntries(orders.map((o) => [o.po_number, o]));
  assert.equal(byPo['B-PO-88213'].level, 'amber');
  assert.equal(byPo['B-PO-88213'].headline.projection.expectedFinish, '2026-11-17');
  assert.equal(byPo['B-PO-88213'].headline.projection.neededPerDay, 578);
  assert.equal(byPo['B-PO-88213'].headline.projection.machinesNeeded, 39);
  assert.equal(byPo['B-PO-88240'].level, 'amber');
  assert.equal(byPo['B-PO-88240'].headline.projection.expectedFinish, '2026-11-10');
  assert.equal(byPo['C-PO-0488'].level, 'red');
  assert.equal(byPo['C-PO-0488'].headline.projection.expectedFinish, '2026-11-18');
  assert.equal(byPo['D-PO-3310'].headline.projection.state, 'STOPPED');
  assert.equal(byPo['C-PO-0495'].headline.kind, 'milestone');
});

test('the board renders the summary strip and filters by buyer, unit, week and status', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const all = await agent.get('/board');
  assert.equal(all.status, 200);
  assert.match(all.text, /13 of 13 orders/);
  assert.match(all.text, /Need 578\/day/);

  const { rows: [buyerC] } = await pool.query("SELECT id FROM buyers WHERE name = 'Company C'");
  const byBuyer = await agent.get(`/board?buyer=${buyerC.id}`);
  assert.match(byBuyer.text, /3 of 13 orders/);
  assert.doesNotMatch(byBuyer.text, /B-PO-88213/);

  const { rows: [printing] } = await pool.query("SELECT id FROM units WHERE name = 'Printing subcontractor'");
  const byUnit = await agent.get(`/board?unit=${printing.id}`);
  assert.match(byUnit.text, /3 of 13 orders/);

  const byWeek = await agent.get('/board?week=2026-W47');
  assert.match(byWeek.text, /B-PO-88213/);
  assert.doesNotMatch(byWeek.text, /B-PO-88240/);

  const none = await agent.get('/board?status=red&week=2026-W53');
  assert.match(none.text, /No orders match these filters/);
});
