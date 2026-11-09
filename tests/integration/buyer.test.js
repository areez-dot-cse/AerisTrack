import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createTestApp, loginAs, DEMO, po } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('Company B\'s token lists only Company B orders', async () => {
  const res = await request(app).get(`/b/${DEMO.tokenB}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /B-PO-88213/);
  assert.doesNotMatch(res.text, /C-PO-0488/);
  assert.doesNotMatch(res.text, /Company D/);
});

test('Company B\'s token cannot open a Company C order, its photos, or see it in the export (404 / absent)', async () => {
  const orderC = await po(pool, 'C-PO-0488');
  assert.equal((await request(app).get(`/b/${DEMO.tokenB}/orders/${orderC.id}`)).status, 404);
  const { rows: [photo] } = await pool.query('SELECT id FROM media WHERE order_id = $1', [orderC.id]);
  assert.equal((await request(app).get(`/b/${DEMO.tokenB}/media/${photo.id}`)).status, 404);
  assert.equal((await request(app).get(`/b/${DEMO.tokenC}/media/${photo.id}`)).status, 200);

  const xlsx = await request(app).get(`/b/${DEMO.tokenB}/weekly.xlsx`).buffer().parse((res, cb) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers['content-disposition'], /CompanyB_status_2026-W45\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  assert.deepEqual(workbook.worksheets.map((w) => w.name), ['Summary', 'Milestones', 'Date changes', 'Warnings']);
  const pos = [];
  workbook.getWorksheet('Summary').eachRow((row, n) => { if (n > 1) pos.push(row.getCell(1).value); });
  assert.ok(pos.includes('B-PO-88213'));
  assert.ok(!pos.includes('C-PO-0488'));
});

test('a detected warning is not visible on the buyer link; a confirmed one is', async () => {
  const orderB = await po(pool, 'B-PO-88213');
  let page = await request(app).get(`/b/${DEMO.tokenB}/orders/${orderB.id}`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /Delay warning/);
  assert.doesNotMatch(page.text, /Need 578/);

  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [w] } = await pool.query("SELECT id FROM warnings WHERE order_id = $1 AND status = 'detected'", [orderB.id]);
  const confirm = await agent.post(`/review/warnings/${w.id}/confirm`).type('form').send({ _csrf: csrf, reasonCategory: 'MACHINE_BREAKDOWN', noteForBuyer: 'Mechanic arrives tomorrow; we expect to recover by 17 Nov.' });
  assert.equal(confirm.status, 302);

  page = await request(app).get(`/b/${DEMO.tokenB}/orders/${orderB.id}`);
  assert.match(page.text, /Machine breakdown/);
  assert.match(page.text, /Mechanic arrives tomorrow/);
  assert.match(page.text, /578/);
  const list = await request(app).get(`/b/${DEMO.tokenB}`);
  assert.match(list.text, /Delay warning/);
});

test('the confirmed Company C warning shows on its link with the reason and note', async () => {
  const orderC = await po(pool, 'C-PO-0488');
  const page = await request(app).get(`/b/${DEMO.tokenC}/orders/${orderC.id}`);
  assert.match(page.text, /Subcontractor delay/);
  assert.match(page.text, /second printer/);
  assert.match(page.text, /1,380/);
});

test('buyer pages never show floor notes, transcripts or hidden photos', async () => {
  const orderB = await po(pool, 'B-PO-88213');
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [photo] } = await pool.query('SELECT id FROM media WHERE order_id = $1 ORDER BY id LIMIT 1', [orderB.id]);
  await agent.post(`/orders/${orderB.id}/media/${photo.id}/share`).type('form').send({ _csrf: csrf, shared: '0' });
  const page = await request(app).get(`/b/${DEMO.tokenB}/orders/${orderB.id}`);
  assert.doesNotMatch(page.text, /மெஷின்/);
  assert.doesNotMatch(page.text, new RegExp(`/media/${photo.id}"`));
  assert.equal((await request(app).get(`/b/${DEMO.tokenB}/media/${photo.id}`)).status, 404);
});

test('an unknown, revoked or office-only token gets the "no longer active" page with 404', async () => {
  const unknown = await request(app).get('/b/not-a-real-token-at-all-0000');
  assert.equal(unknown.status, 404);
  assert.match(unknown.text, /no longer active/);

  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const { rows: [buyer] } = await pool.query("SELECT id FROM buyers WHERE name = 'Company D'");
  const created = await agent.post(`/buyers/${buyer.id}/links`).type('form').send({ _csrf: csrf });
  assert.equal(created.status, 302);
  const page = await agent.get('/buyers');
  const token = page.text.match(/\/b\/([A-Za-z0-9_-]{40,})/)[1];
  assert.equal((await request(app).get(`/b/${token}`)).status, 200);
  const { rows: [link] } = await pool.query('SELECT id FROM buyer_links WHERE buyer_id = $1 ORDER BY id DESC LIMIT 1', [buyer.id]);
  await agent.post(`/buyers/${buyer.id}/links/${link.id}/revoke`).type('form').send({ _csrf: csrf });
  assert.equal((await request(app).get(`/b/${token}`)).status, 404);
  assert.doesNotMatch((await agent.get('/buyers')).text, new RegExp(token));
});
