// Shared setup for integration tests: a fresh, seeded test database and a
// supertest agent that can sign in as any seeded user. NODE_ENV=test is set
// by the npm script so config.js picks DATABASE_URL_TEST.
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.DEMO_TODAY ??= '2026-11-04';
process.env.GROQ_API_KEY = ''; // tests always exercise the keyword fallback

export const DEMO = {
  merchandiser: { email: 'priya@example.com', password: 'tna-demo-2026' },
  merchandiser2: { email: 'karthik@example.com', password: 'tna-demo-2026' },
  supervisorF1: { phone: '9000000001', pin: '1234' }, // Unit 1 · Floor 1, runs B-PO-88213 stitching
  supervisorF2: { phone: '9000000002', pin: '1234' }, // Unit 1 · Floor 2
  tokenB: 'demo-company-b-5f3c9a1e7b2d4c6a8e0f1a3b5c7d9e2f',
  tokenC: 'demo-company-c-9a7e5c3b1d0f2a4c6e8b0d2f4a6c8e1b',
};

export async function createTestApp() {
  const { config } = await import('../../src/config.js');
  assert.equal(config.isTest, true, 'integration tests must run with NODE_ENV=test');
  const { pool } = await import('../../src/db/pool.js');
  const { migrate } = await import('../../src/db/migrate.js');
  const { seed } = await import('../../src/db/seed.js');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seed();
  const { createApp } = await import('../../src/app.js');
  return { app: createApp(), pool };
}

export function csrfFromHtml(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : null;
}

// Signs in and returns an agent that keeps the session cookie plus its CSRF token.
export async function loginAs(app, who) {
  const agent = request.agent(app);
  const page = await agent.get(who.phone ? '/login?tab=supervisor' : '/login');
  const csrf = csrfFromHtml(page.text);
  const res = who.phone
    ? await agent.post('/login/supervisor').type('form').send({ _csrf: csrf, phone: who.phone, pin: who.pin })
    : await agent.post('/login/office').type('form').send({ _csrf: csrf, email: who.email, password: who.password });
  assert.equal(res.status, 302, `login failed: ${res.text.slice(0, 200)}`);
  // Login regenerates the session, so take the CSRF token from a page after it.
  if (who.phone) {
    const me = await agent.get('/api/s/me');
    return { agent, csrf: me.body?.csrfToken ?? null };
  }
  const after = await agent.get('/templates');
  return { agent, csrf: csrfFromHtml(after.text) };
}

export async function po(pool, poNumber) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE po_number = $1', [poNumber]);
  return rows[0];
}

export async function milestone(pool, poNumber, name) {
  const { rows } = await pool.query(
    'SELECT m.* FROM order_milestones m JOIN orders o ON o.id = m.order_id WHERE o.po_number = $1 AND m.name = $2',
    [poNumber, name],
  );
  return rows[0];
}
