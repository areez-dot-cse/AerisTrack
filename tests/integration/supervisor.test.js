import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestApp, loginAs, DEMO, milestone } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

const post = (agent, csrf, fields) => {
  const req = agent.post('/api/s/entries').set('X-CSRF-Token', csrf).set('Accept', 'application/json');
  for (const [key, value] of Object.entries(fields)) req.field(key, String(value));
  return req;
};

test('the PWA shell and today list are only for supervisors, and the list is their floor only', async () => {
  const anon = await loginAs(app, DEMO.merchandiser);
  assert.equal((await anon.agent.get('/s/')).status, 403);
  assert.equal((await anon.agent.get('/api/s/today')).status, 403);

  const { agent } = await loginAs(app, DEMO.supervisorF1);
  assert.equal((await agent.get('/s/')).status, 200);
  const today = await agent.get('/api/s/today');
  assert.equal(today.status, 200);
  assert.equal(today.body.floor.name, 'Floor 1');
  const pos = today.body.stages.map((s) => s.po);
  assert.ok(pos.includes('B-PO-88213'));
  assert.ok(!pos.includes('B-PO-88251')); // stitched on Floor 2
  const stitching = today.body.stages.find((s) => s.po === 'B-PO-88213');
  assert.equal(stitching.done, 6800);
  assert.equal(stitching.lastMachines, 32);
});

test('a supervisor cannot post an entry for another floor\'s stage (403)', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF2);
  const stage = await milestone(pool, 'B-PO-88213', 'Stitching'); // Floor 1
  const res = await post(agent, csrf, { stageId: stage.id, pieces: 100, machines: 10, clientUuid: crypto.randomUUID() });
  assert.equal(res.status, 403);
});

test('posting the same client_uuid twice creates one entry; a new uuid for the same day overwrites', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF1);
  const stage = await milestone(pool, 'B-PO-88213', 'Stitching');
  const uuid = crypto.randomUUID();
  const first = await post(agent, csrf, { stageId: stage.id, pieces: 500, machines: 36, clientUuid: uuid });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.duplicate, false);
  const again = await post(agent, csrf, { stageId: stage.id, pieces: 500, machines: 36, clientUuid: uuid });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  let { rows } = await pool.query("SELECT pieces, machines FROM daily_entries WHERE order_milestone_id = $1 AND entry_date = '2026-11-04'", [stage.id]);
  assert.deepEqual(rows, [{ pieces: 500, machines: 36 }]);

  const overwrite = await post(agent, csrf, { stageId: stage.id, pieces: 520, machines: 38, clientUuid: crypto.randomUUID() });
  assert.equal(overwrite.status, 200);
  ({ rows } = await pool.query("SELECT pieces, machines FROM daily_entries WHERE order_milestone_id = $1 AND entry_date = '2026-11-04'", [stage.id]));
  assert.deepEqual(rows, [{ pieces: 520, machines: 38 }]);
});

test('validation rejects pieces > remaining, machines > floor total, 0 machines with pieces, negatives, no CSRF', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF1);
  const stage = await milestone(pool, 'B-PO-88213', 'Stitching');
  const cases = [
    [{ pieces: 9000, machines: 40 }, /remaining/],
    [{ pieces: 100, machines: 41 }, /floor's 40/],
    [{ pieces: 100, machines: 0 }, /0 machines/],
    [{ pieces: -5, machines: 10 }, /At least 0/],
  ];
  for (const [fields, pattern] of cases) {
    const res = await post(agent, csrf, { stageId: stage.id, clientUuid: crypto.randomUUID(), ...fields });
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.match(res.body.error, pattern);
  }
  const noCsrf = await agent.post('/api/s/entries').field('stageId', String(stage.id)).field('pieces', '1').field('machines', '1');
  assert.equal(noCsrf.status, 403);
});

test('0 machines with closure days sets closed_until and turns the order red with a finish date; without, no finish date', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF1);
  const stage = await milestone(pool, 'B-PO-88213', 'Stitching');
  const { loadSummary } = await import('../../src/services/orderSummary.js');

  const closed = await post(agent, csrf, { stageId: stage.id, pieces: 0, machines: 0, closedDays: 3, clientUuid: crypto.randomUUID() });
  assert.equal(closed.status, 200, closed.text);
  let summary = await loadSummary(stage.order_id);
  assert.equal(summary.level, 'red');
  assert.equal(summary.headline.projection.closedDays, 3);
  // done is 6,320 after the previous test, so 5,680 left at 600/day = 10 days + 3 closed = 19 Nov
  assert.equal(summary.headline.projection.expectedFinish, '2026-11-19');

  const stopped = await post(agent, csrf, { stageId: stage.id, pieces: 0, machines: 0, clientUuid: crypto.randomUUID() });
  assert.equal(stopped.status, 200);
  summary = await loadSummary(stage.order_id);
  assert.equal(summary.headline.projection.state, 'STOPPED');
  assert.equal(summary.headline.projection.expectedFinish, null);
  const { rows: [w] } = await pool.query('SELECT level, status FROM warnings WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [stage.order_id]);
  assert.deepEqual(w, { level: 'red', status: 'detected' });
});

test('with no GROQ_API_KEY a note gets a keyword category, needs_review, and the entry is still saved', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF2);
  const stage = await milestone(pool, 'B-PO-88251', 'Stitching');
  const res = await post(agent, csrf, { stageId: stage.id, pieces: 200, machines: 16, clientUuid: crypto.randomUUID(), noteText: 'இன்று 2 மணி நேரம் கரண்ட் இல்லை' });
  assert.equal(res.status, 200, res.text);
  let note;
  for (let i = 0; i < 40; i += 1) {
    ({ rows: [note] } = await pool.query('SELECT * FROM notes WHERE entry_id = $1', [res.body.entry.id]));
    if (note && note.status !== 'processing') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(note.status, 'needs_review');
  assert.equal(note.ai_source, 'keywords');
  assert.equal(note.ai_category, 'POWER_CUT');
  assert.equal(note.translation_en, null);
  assert.match(note.ai_error, /GROQ_API_KEY/);
});

test('a photo is stored with the entry and served to the right people only', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.supervisorF1);
  const stage = await milestone(pool, 'B-PO-88213', 'Stitching');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const res = await agent.post('/api/s/entries').set('X-CSRF-Token', csrf)
    .field('stageId', String(stage.id)).field('pieces', '10').field('machines', '10').field('clientUuid', crypto.randomUUID())
    .attach('photo', png, { filename: 'p.png', contentType: 'image/png' });
  assert.equal(res.status, 200, res.text);
  const { rows: [media] } = await pool.query('SELECT id FROM media WHERE entry_id = $1', [res.body.entry.id]);
  assert.equal((await agent.get(`/media/${media.id}`)).status, 200);
  const other = await loginAs(app, DEMO.supervisorF2);
  assert.equal((await other.agent.get(`/media/${media.id}`)).status, 404);
  const office = await loginAs(app, DEMO.merchandiser);
  assert.equal((await office.agent.get(`/media/${media.id}`)).status, 200);

  const bad = await agent.post('/api/s/entries').set('X-CSRF-Token', csrf)
    .field('stageId', String(stage.id)).field('pieces', '10').field('machines', '10').field('clientUuid', crypto.randomUUID())
    .attach('photo', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(bad.status, 400);
});
