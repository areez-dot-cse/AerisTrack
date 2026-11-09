import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestApp, loginAs, csrfFromHtml, DEMO } from './helpers.js';

let app; let pool;
before(async () => { ({ app, pool } = await createTestApp()); });
after(async () => { await pool.end(); });

test('an office page without a session redirects to login', async () => {
  const res = await request(app).get('/templates');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});

test('a supervisor gets 403 on office pages', async () => {
  const { agent } = await loginAs(app, DEMO.supervisorF1);
  const res = await agent.get('/templates');
  assert.equal(res.status, 403);
});

test('a merchandiser can open office pages', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const res = await agent.get('/templates');
  assert.equal(res.status, 200);
  assert.match(res.text, /Basic tee/);
});

test('logout invalidates the board and prevents it from being stored', async () => {
  const { agent, csrf } = await loginAs(app, DEMO.merchandiser);
  const board = await agent.get('/board');
  assert.match(board.headers['cache-control'], /no-store/);
  const logout = await agent.post('/logout').type('form').send({ _csrf: csrf });
  assert.equal(logout.status, 302);
  assert.equal(logout.headers['clear-site-data'], '"cache"');
  const afterLogout = await agent.get('/board');
  assert.equal(afterLogout.status, 302);
  assert.equal(afterLogout.headers.location, '/login');
});

test('a POST without a CSRF token is rejected', async () => {
  const { agent } = await loginAs(app, DEMO.merchandiser);
  const res = await agent.post('/language').type('form').send({ lang: 'ta' });
  assert.equal(res.status, 403);
});

test('wrong credentials are refused and the sixth attempt is rate limited', async () => {
  const agent = request.agent(app);
  const csrf = csrfFromHtml((await agent.get('/login')).text);
  for (let i = 0; i < 5; i += 1) {
    const res = await agent.post('/login/office').type('form').send({ _csrf: csrf, email: 'limit@example.com', password: 'wrong' });
    assert.equal(res.status, 401);
  }
  const blocked = await agent.post('/login/office').type('form').send({ _csrf: csrf, email: 'limit@example.com', password: 'wrong' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.text, /Too many attempts/);
});
