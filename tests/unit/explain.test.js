import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStage } from '../../src/services/projection.js';
import { stageExplanation, headlineExplanation } from '../../src/services/explain.js';
import { makeT } from '../../src/middleware/i18n.js';
import { formatDate, formatQty } from '../../src/lib/format.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const helpers = (lang) => ({
  t: makeT(lang),
  fmtDate: (d) => formatDate(d, { today: '2026-11-04', months: lang === 'ta' ? ['ஜன', 'பிப்', 'மார்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'] : months }),
  fmtQty: formatQty,
});
const entry = (date, machines, pieces, closedUntil = null) => ({ date, machines, pieces, closedUntil });
const base = { target: 12000, done: 6800, plannedStart: '2026-10-21', deadline: '2026-11-14', today: '2026-11-04' };

test('the one-line maths for B-PO-88213 reads as the brief shows it, in English and Tamil', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 600), entry('2026-11-03', 40, 600), entry('2026-11-04', 32, 480)] });
  const en = stageExplanation(p, { ...helpers('en'), unitWord: 'machines', totalMachines: 40 });
  assert.equal(en, 'Need 578/day · Made today 480 · Capacity now 480/day (32 of 40 machines) · Finishes 17 Nov');
  const detailed = stageExplanation(p, { ...helpers('en'), unitWord: 'machines', totalMachines: 40, detailed: true });
  assert.equal(detailed, 'Need 578/day · Made today 480 · Capacity now 480/day (32 of 40 machines) · Finishes 17 Nov · vs deadline 14 Nov · needs 39 working machines to recover');
  const ta = stageExplanation(p, { ...helpers('ta'), unitWord: 'மெஷின்கள்', totalMachines: 40 });
  assert.equal(ta, 'தேவை 578/நாள் · இன்று 480 · தற்போதைய திறன் 480/நாள் (40-இல் 32 மெஷின்கள்) · முடியும் 17 நவ');
});

test('stopped, stale and overdue stages explain themselves without numbers that do not exist', () => {
  const stopped = projectStage({ ...base, entries: [entry('2026-11-03', 40, 600), entry('2026-11-04', 0, 0)] });
  assert.equal(stageExplanation(stopped, { ...helpers('en'), unitWord: 'machines', totalMachines: 40 }), 'Unit stopped — no finish date');

  const stale = projectStage({ ...base, done: 11000, entries: [entry('2026-10-28', 40, 600), entry('2026-10-29', 40, 600), entry('2026-10-30', 40, 600)] });
  assert.match(stageExplanation(stale, { ...helpers('en'), unitWord: 'machines', totalMachines: 40 }), /· No update for 4 days$/);

  const overdue = projectStage({ ...base, done: 11000, today: '2026-11-16', entries: [entry('2026-11-14', 40, 600)] });
  assert.equal(stageExplanation(overdue, { ...helpers('en'), unitWord: 'machines' }), 'Deadline 14 Nov passed · 1,000 pieces left · 1 working days late');
});

test('an overdue date milestone is the headline when it set the colour', () => {
  const headline = { kind: 'milestone', milestone: { name: 'PP sample approval', planned_end: '2026-10-30' }, status: { overdueDays: 4, level: 'red' } };
  assert.equal(headlineExplanation(headline, helpers('en')), 'PP sample approval overdue by 4 working days (planned 30 Oct)');
  assert.equal(headlineExplanation(null, helpers('en')), 'No quantity stages');
});
