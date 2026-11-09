// Every screen the reviewer will open, checked the way a browser would see it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createTestApp, loginAs, DEMO, po, milestone } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('every office page renders for a merchandiser with its key content', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const order = await po(pool, 'C-PO-0488');
  const { rows: [template] } = await pool.query("SELECT id FROM templates WHERE name = 'Basic tee'");
  const checks = [
    ['/board', /3 of 13 orders|13 of 13 orders/],
    ['/orders/new', /2\. Quantities/],
    [`/orders/${order.id}`, /Need 1,380\/day/],
    [`/orders/${order.id}`, /பிரிண்டிங் யூனிட்டிலிருந்து/],
    [`/orders/${order.id}`, /Shared with buyer/],
    [`/orders/${order.id}`, /Date-change history/],
    ['/templates', /Basic tee/],
    [`/templates/${template.id}`, /Cutting/],
    ['/review', /Needs review/],
    ['/review?tab=warnings', /Confirm to buyer/],
    ['/buyers', /Create link/],
  ];
  for (const [path, pattern] of checks) {
    const res = await agent.get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.text, pattern, path);
  }
});

test('unknown pages and orders get the friendly 404 page', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const missing = await agent.get('/orders/999999');
  assert.equal(missing.status, 404);
  assert.match(missing.text, /Page not found/);
  assert.equal((await agent.get('/no-such-page')).status, 404);
});

test('the language toggle switches the office to Tamil and is saved on the user', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser2);
  const toTamil = await agent.post('/language').type('form').send({ _csrf: csrf, lang: 'ta' });
  assert.equal(toTamil.status, 302);
  const board = await agent.get('/board');
  assert.match(board.text, /ஆர்டர் பலகை/);
  assert.match(board.text, /தேவை 578\/நாள்/);
  const { rows: [user] } = await pool.query("SELECT language FROM users WHERE email = 'karthik@example.com'");
  assert.equal(user.language, 'ta');
  await agent.post('/language').type('form').send({ _csrf: csrf, lang: 'en' });
  assert.match((await agent.get('/board')).text, /Order board/);
});

test('the phone app shell, service worker, manifest and locale files are served', async () => {
  const { agent } = await loginAs(app, DEMO.supervisorF1);
  const shell = await agent.get('/s/');
  assert.equal(shell.status, 200);
  assert.match(shell.text, /manifest\.webmanifest/);
  assert.match(shell.text, /\/js\/supervisor\.js/);
  for (const [path, type] of [['/sw.js', /javascript/], ['/manifest.webmanifest', /manifest|json/], ['/locales/ta.json', /json/], ['/css/supervisor.css', /css/], ['/icons/icon-192.png', /png/]]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers['content-type'], type, path);
  }
  const ta = await request(app).get('/locales/ta.json');
  assert.equal(ta.body.sup.send, 'அனுப்பு');
});

test('the office Excel shows the live colour per order', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const { rows: [buyer] } = await pool.query("SELECT id FROM buyers WHERE name = 'Company B'");
  const res = await agent.get(`/buyers/${buyer.id}/weekly.xlsx`).buffer().parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  const statuses = {};
  workbook.getWorksheet('Summary').eachRow((row, n) => { if (n > 1) statuses[row.getCell(1).value] = row.getCell(8).value; });
  assert.equal(statuses['B-PO-88213'], 'At risk');
  assert.equal(statuses['B-PO-88199'], 'On track');
  assert.equal(workbook.getWorksheet('Warnings').getRow(2).getCell(1).value, 'No confirmed warnings');
});

test('a merchandiser can back-date an entry for a subcontractor stage, but not into the future', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const printing = await milestone(pool, 'C-PO-0488', 'Printing');
  const ok = await agent.post(`/orders/${printing.order_id}/stages/${printing.id}/entries`)
    .field('_csrf', csrf).field('entryDate', '2026-11-03').field('pieces', '550').field('machines', '10').field('noteText', '');
  assert.equal(ok.status, 302);
  const { rows: [entry] } = await pool.query("SELECT pieces, entered_by FROM daily_entries WHERE order_milestone_id = $1 AND entry_date = '2026-11-03'", [printing.id]);
  assert.equal(entry.pieces, 550);
  const { rows: [who] } = await pool.query('SELECT role FROM users WHERE id = $1', [entry.entered_by]);
  assert.equal(who.role, 'merchandiser');

  const future = await agent.post(`/orders/${printing.order_id}/stages/${printing.id}/entries`)
    .field('_csrf', csrf).field('entryDate', '2026-11-05').field('pieces', '10').field('machines', '10');
  assert.equal(future.status, 302);
  const page = await agent.get(`/orders/${printing.order_id}`);
  assert.match(page.text, /cannot be in the future/);
});

test('a note stuck in processing shows as failed with a Retry AI button', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const order = await po(pool, 'B-PO-88213');
  await pool.query("UPDATE notes SET status = 'processing', ai_started_at = now() - interval '3 minutes', translation_en = NULL WHERE order_id = $1", [order.id]);
  const page = await agent.get(`/orders/${order.id}`);
  assert.match(page.text, /AI processing failed/);
  assert.match(page.text, /Retry AI/);
  await pool.query("UPDATE notes SET status = 'processing', ai_started_at = now() WHERE order_id = $1", [order.id]);
  const fresh = await agent.get(`/orders/${order.id}`);
  assert.match(fresh.text, /Processing…/);
});
