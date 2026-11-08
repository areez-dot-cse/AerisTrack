import test from 'node:test';
import assert from 'node:assert/strict';
import { workingDaysBetween, addWorkingDays, isWorkingDay, workingDaysInRange } from '../../src/services/workdays.js';

test('W1 working days between 4 Nov and 14 Nov 2026 skip the Sunday', () => {
  assert.equal(workingDaysBetween('2026-11-04', '2026-11-14'), 9);
});

test('W2 adding one working day to Saturday 7 Nov lands on Monday 9 Nov', () => {
  assert.equal(addWorkingDays('2026-11-07', 1), '2026-11-09');
});

test('workingDaysBetween is zero when the end is not after the start', () => {
  assert.equal(workingDaysBetween('2026-11-14', '2026-11-14'), 0);
  assert.equal(workingDaysBetween('2026-11-14', '2026-11-10'), 0);
});

test('Sunday is the only non-working day', () => {
  assert.equal(isWorkingDay('2026-11-01'), false); // Sunday
  assert.equal(isWorkingDay('2026-11-07'), true); // Saturday
  assert.deepEqual(workingDaysInRange('2026-10-31', '2026-11-03'), ['2026-10-31', '2026-11-02', '2026-11-03']);
});
