import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, locales } from '../../src/middleware/i18n.js';
import { confidenceBand } from '../../src/services/categories.js';

test('Tamil strings are used when present and English fills any gap', () => {
  assert.equal(translate('ta', 'nav.board'), 'பலகை');
  assert.equal(translate('ta', 'buyer.title'), 'Order status'); // buyer pages are English only
  assert.equal(translate('en', 'status.amber'), 'At risk');
  assert.equal(translate('ta', 'status.amber'), 'ஆபத்தில்');
});

test('placeholders are substituted and a missing key is returned as itself', () => {
  assert.equal(translate('en', 'sup.outboxWaiting', { count: 2 }), '2 updates waiting to send');
  assert.equal(translate('ta', 'sup.doneOf', { done: '6,800', target: '12,000' }), '12,000-இல் 6,800');
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
  assert.equal(translate('ta', 'months').length, 12);
});

test('every supervisor, office and category string has a Tamil translation', () => {
  const walk = (node, prefix = '') => Object.entries(node).flatMap(([k, v]) => (typeof v === 'object' && !Array.isArray(v) ? walk(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  const missing = walk(locales.en).filter((key) => !key.startsWith('buyer.') && !key.startsWith('export.'))
    .filter((key) => translate('ta', key) === translate('en', key) && !['app.company', 'nav.english', 'nav.tamil', 'review.sourceAi'].includes(key));
  assert.deepEqual(missing, []);
});

test('confidence bands: high from 0.8, medium from 0.6, low below', () => {
  assert.equal(confidenceBand(0.93), 'high');
  assert.equal(confidenceBand(0.8), 'high');
  assert.equal(confidenceBand(0.62), 'medium');
  assert.equal(confidenceBand(0.35), 'low');
  assert.equal(confidenceBand(null), 'low');
});
