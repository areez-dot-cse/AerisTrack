import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatQty, isoWeek, percent } from '../../src/lib/format.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

test('dates read as "14 Nov", with the year only when it differs from today', () => {
  assert.equal(formatDate('2026-11-14', { today: '2026-11-04', months }), '14 Nov');
  assert.equal(formatDate('2025-12-01', { today: '2026-11-04', months }), '1 Dec 2025');
  assert.equal(formatDate(null, { today: '2026-11-04', months }), '');
});

test('quantities get thousands separators', () => {
  assert.equal(formatQty(12000), '12,000');
  assert.equal(formatQty(578), '578');
  assert.equal(formatQty(null), '');
});

test('ISO week labels drive the ship-week filter and the export filename', () => {
  assert.equal(isoWeek('2026-11-20'), '2026-W47');
  assert.equal(isoWeek('2026-11-12'), '2026-W46');
  assert.equal(isoWeek('2026-11-04'), '2026-W45');
  assert.equal(isoWeek('2027-01-01'), '2026-W53'); // 1 Jan 2027 is a Friday in the last ISO week of 2026
});

test('progress percentages are whole numbers capped at 100', () => {
  assert.equal(percent(3100, 10000), 31);
  assert.equal(percent(12000, 12000), 100);
  assert.equal(percent(5, 0), 0);
});
