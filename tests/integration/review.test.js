import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, loginAs, DEMO, po } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('the inbox lists notes needing review first and shows the detected warnings with their maths', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const notes = await agent.get('/review');
  assert.equal(notes.status, 200);
  const needs = notes.text.indexOf('நிலைமை சரியில்லை');
  const suggested = notes.text.indexOf('8 மெஷின் பழுது');
  assert.ok(needs > 0 && suggested > needs, 'needs_review note comes before suggested notes');
  assert.match(notes.text, /Translation unavailable|8 machines broken down/);

  const warnings = await agent.get('/review?tab=warnings');
  assert.match(warnings.text, /B-PO-88213/);
  assert.match(warnings.text, /D-PO-3310/);
  assert.match(warnings.text, /Unit stopped/);
  assert.match(warnings.text, /PP sample approval overdue by 4 working days/);
});

test('a merchandiser can change the AI category and confirm; both categories are kept', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [note] } = await pool.query("SELECT id FROM notes WHERE status = 'needs_review'");
  const res = await agent.post(`/review/notes/${note.id}/confirm`).type('form').send({ _csrf: csrf, category: 'LABOUR_SHORTAGE', returnTo: '/review' });
  assert.equal(res.status, 302);
  const { rows: [after] } = await pool.query('SELECT * FROM notes WHERE id = $1', [note.id]);
  assert.equal(after.status, 'confirmed');
  assert.equal(after.ai_category, 'OTHER');
  assert.equal(after.final_category, 'LABOUR_SHORTAGE');
  assert.ok(after.reviewed_by);
  const bad = await agent.post(`/review/notes/${note.id}/confirm`).type('form').send({ _csrf: csrf, category: 'NOT_A_CATEGORY' });
  assert.equal(bad.status, 302);
});

test('Retry AI reprocesses a note (keyword fallback without a key) and dismissing a warning needs a reason', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [note] } = await pool.query("SELECT id FROM notes WHERE ai_category = 'MACHINE_BREAKDOWN'");
  const retry = await agent.post(`/review/notes/${note.id}/retry`).type('form').send({ _csrf: csrf });
  assert.equal(retry.status, 302);
  let row;
  for (let i = 0; i < 40; i += 1) {
    ({ rows: [row] } = await pool.query('SELECT status, ai_source, ai_category FROM notes WHERE id = $1', [note.id]));
    if (row.status !== 'processing') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(row, { status: 'needs_review', ai_source: 'keywords', ai_category: 'MACHINE_BREAKDOWN' });

  const order = await po(pool, 'B-PO-88240');
  const { rows: [w] } = await pool.query("SELECT id FROM warnings WHERE order_id = $1 AND status = 'detected'", [order.id]);
  await agent.post(`/review/warnings/${w.id}/dismiss`).type('form').send({ _csrf: csrf, reason: '' });
  assert.equal((await pool.query('SELECT status FROM warnings WHERE id = $1', [w.id])).rows[0].status, 'detected');
  await agent.post(`/review/warnings/${w.id}/dismiss`).type('form').send({ _csrf: csrf, reason: 'Two extra tables arrive tomorrow' });
  const { rows: [dismissed] } = await pool.query('SELECT status, dismiss_reason FROM warnings WHERE id = $1', [w.id]);
  assert.deepEqual(dismissed, { status: 'dismissed', dismiss_reason: 'Two extra tables arrive tomorrow' });

  // Still amber: no new warning. A worse level would open a new one.
  const { refreshWarning } = await import('../../src/services/warnings.js');
  await refreshWarning(order.id);
  const { rows } = await pool.query('SELECT status FROM warnings WHERE order_id = $1 ORDER BY id', [order.id]);
  assert.deepEqual(rows.map((r) => r.status), ['dismissed']);
});
