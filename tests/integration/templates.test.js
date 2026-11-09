import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, loginAs, DEMO } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('editing a template does not change an existing order\'s milestones', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [template] } = await pool.query("SELECT id FROM templates WHERE name = 'Basic tee'");
  const before = await pool.query(
    "SELECT m.name, m.planned_start, m.planned_end FROM order_milestones m JOIN orders o ON o.id = m.order_id WHERE o.po_number = 'B-PO-88213' ORDER BY m.seq",
  );

  const res = await agent.post(`/templates/${template.id}`).type('form').send({
    _csrf: csrf,
    name: 'Basic tee v2',
    'milestones[0][name]': 'Order confirmation', 'milestones[0][kind]': 'date', 'milestones[0][endOffsetDays]': '70',
    'milestones[1][name]': 'Stitching', 'milestones[1][kind]': 'quantity', 'milestones[1][startOffsetDays]': '20', 'milestones[1][endOffsetDays]': '4',
  });
  assert.equal(res.status, 302);

  const updated = await pool.query('SELECT name, end_offset_days FROM template_milestones WHERE template_id = $1 ORDER BY seq', [template.id]);
  assert.equal(updated.rows.length, 2);
  assert.equal(updated.rows[0].end_offset_days, 70);

  const after = await pool.query(
    "SELECT m.name, m.planned_start, m.planned_end FROM order_milestones m JOIN orders o ON o.id = m.order_id WHERE o.po_number = 'B-PO-88213' ORDER BY m.seq",
  );
  assert.deepEqual(after.rows, before.rows);
});

test('a template without a quantity stage is rejected with an inline error', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const res = await agent.post('/templates').type('form').send({
    _csrf: csrf, name: 'Dates only',
    'milestones[0][name]': 'Order confirmation', 'milestones[0][kind]': 'date', 'milestones[0][endOffsetDays]': '60',
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /at least one quantity stage/);
});

test('deleting a template keeps the orders that used it', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [template] } = await pool.query("SELECT id FROM templates WHERE name = 'Polo'");
  const res = await agent.post(`/templates/${template.id}/delete`).type('form').send({ _csrf: csrf });
  assert.equal(res.status, 302);
  const { rows } = await pool.query("SELECT count(*) AS n FROM orders WHERE template_name = 'Polo'");
  assert.equal(rows[0].n, 4);
});
