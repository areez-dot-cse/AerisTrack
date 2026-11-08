import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStage } from '../../src/services/projection.js';

const TODAY = '2026-11-04';
const entry = (date, machines, pieces, closedUntil = null) => ({ date, machines, pieces, closedUntil });
const base = { target: 12000, done: 6800, plannedStart: '2026-10-21', deadline: '2026-11-14', today: TODAY };

test('P1 normal day: 40 machines at 600/day is on track', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 600), entry('2026-11-03', 40, 600), entry('2026-11-04', 40, 600)] });
  assert.equal(p.piecesPerMachine, 15);
  assert.equal(p.capacityPerDay, 600);
  assert.equal(p.neededPerDay, 578);
  assert.equal(p.expectedFinish, '2026-11-14');
  assert.equal(p.daysLate, 0);
  assert.equal(p.state, 'ON_TRACK');
  assert.equal(p.level, 'green');
  assert.equal(p.stale, false);
});

test('P2 capacity drop today: 32 machines finishes 17 Nov, amber, needs 39 machines', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 600), entry('2026-11-03', 40, 600), entry('2026-11-04', 32, 480)] });
  assert.equal(p.capacityPerDay, 480);
  assert.equal(p.expectedFinish, '2026-11-17');
  assert.equal(p.daysLate, 2);
  assert.equal(p.level, 'amber');
  assert.equal(p.state, 'AT_RISK');
  assert.equal(p.machinesNeeded, 39);
  assert.equal(p.madeToday, 480);
});

test('P3 zero machines with 3 closure days: reopens with 40 machines, finishes 18 Nov, red', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 600), entry('2026-11-03', 40, 600), entry('2026-11-04', 0, 0, '2026-11-07')] });
  assert.equal(p.machinesNow, 40);
  assert.equal(p.closedDays, 3);
  assert.equal(p.expectedFinish, '2026-11-18');
  assert.equal(p.daysLate, 3);
  assert.equal(p.level, 'red');
  assert.equal(p.state, 'LATE');
});

test('P4 zero machines and no closure days: STOPPED with no finish date, no exception', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 600), entry('2026-11-03', 40, 600), entry('2026-11-04', 0, 0, null)] });
  assert.equal(p.state, 'STOPPED');
  assert.equal(p.level, 'red');
  assert.equal(p.expectedFinish, null);
});

test('P5 one entry is not enough data: grey and not stale', () => {
  const p = projectStage({ ...base, done: 600, entries: [entry('2026-11-04', 40, 600)] });
  assert.equal(p.state, 'NO_DATA');
  assert.equal(p.level, 'grey');
  assert.equal(p.stale, false);
});

test('P6 done equals target: COMPLETE, green', () => {
  const p = projectStage({ ...base, done: 12000, entries: [] });
  assert.equal(p.state, 'COMPLETE');
  assert.equal(p.level, 'green');
});

test('P7 past the deadline with pieces left: OVERDUE, red, 1 working day late', () => {
  const p = projectStage({ ...base, done: 11000, today: '2026-11-16', entries: [entry('2026-11-14', 40, 600)] });
  assert.equal(p.state, 'OVERDUE');
  assert.equal(p.level, 'red');
  assert.equal(p.daysLate, 1);
});

test('P8 machines ran but made nothing: STOPPED, red, no exception', () => {
  const p = projectStage({ ...base, entries: [entry('2026-11-02', 40, 0), entry('2026-11-03', 40, 0), entry('2026-11-04', 40, 0)] });
  assert.equal(p.state, 'STOPPED');
  assert.equal(p.level, 'red');
  assert.equal(p.expectedFinish, null);
});

test('P9 stale: would be green but the last entry is 4 working days old, so amber', () => {
  const p = projectStage({ ...base, done: 11000, entries: [entry('2026-10-28', 40, 600), entry('2026-10-29', 40, 600), entry('2026-10-30', 40, 600)] });
  assert.equal(p.expectedFinish, '2026-11-06');
  assert.equal(p.daysLate, 0);
  assert.equal(p.state, 'ON_TRACK');
  assert.equal(p.stale, true);
  assert.equal(p.staleDays, 4);
  assert.equal(p.level, 'amber');
});

test('P10 before the planned start with no entries: NOT_STARTED, level none', () => {
  const p = projectStage({ ...base, done: 0, plannedStart: '2026-11-10', entries: [] });
  assert.equal(p.state, 'NOT_STARTED');
  assert.equal(p.level, 'none');
});

test('a stage past its planned start with no entries is grey and goes stale', () => {
  const p = projectStage({ ...base, done: 0, plannedStart: '2026-10-30', entries: [] });
  assert.equal(p.state, 'NO_DATA');
  assert.equal(p.stale, true);
  assert.equal(p.level, 'amber');
});

test('the seed figures for the three brief orders', () => {
  const b88240 = projectStage({ target: 8000, done: 5200, plannedStart: '2026-10-25', deadline: '2026-11-09', today: TODAY,
    entries: [entry('2026-11-02', 20, 600), entry('2026-11-03', 20, 600), entry('2026-11-04', 20, 600)] });
  assert.equal(b88240.neededPerDay, 700);
  assert.equal(b88240.expectedFinish, '2026-11-10');
  assert.equal(b88240.level, 'amber');
  assert.equal(b88240.machinesNeeded, 24);

  const c0488 = projectStage({ target: 10000, done: 3100, plannedStart: '2026-10-29', deadline: '2026-11-10', today: TODAY,
    entries: [entry('2026-11-02', 10, 600), entry('2026-11-03', 10, 600), entry('2026-11-04', 10, 600)] });
  assert.equal(c0488.neededPerDay, 1380);
  assert.equal(c0488.expectedFinish, '2026-11-18');
  assert.equal(c0488.level, 'red');
  assert.equal(c0488.machinesNeeded, 23);
});
