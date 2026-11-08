import test from 'node:test';
import assert from 'node:assert/strict';
import { rollUpOrder, worstLevel, dateMilestoneStatus } from '../../src/services/orderStatus.js';

const TODAY = '2026-11-04';
const stage = (name, level, seq = 1) => ({ milestone: { name, seq }, projection: { level, state: 'X' } });

test('the worst stage wins: red beats amber beats grey beats green; none is ignored', () => {
  assert.equal(worstLevel(['green', 'amber', 'none']), 'amber');
  assert.equal(worstLevel(['green', 'red', 'amber']), 'red');
  assert.equal(worstLevel(['green', 'grey']), 'grey');
  assert.equal(worstLevel(['none', 'none']), 'grey');
  assert.equal(worstLevel(['green', 'none']), 'green');
});

test('the headline is the stage that set the colour', () => {
  const result = rollUpOrder({
    stages: [stage('Cutting', 'green', 1), stage('Stitching', 'amber', 2), stage('Finishing', 'none', 3)],
    dateMilestones: [],
    today: TODAY,
  });
  assert.equal(result.level, 'amber');
  assert.equal(result.headline.milestone.name, 'Stitching');
});

test('an overdue date milestone turns the order amber (1–2 days) or red (more)', () => {
  assert.equal(dateMilestoneStatus({ plannedEnd: '2026-11-02', actualDate: null, today: TODAY }).level, 'amber');
  assert.equal(dateMilestoneStatus({ plannedEnd: '2026-10-30', actualDate: null, today: TODAY }).level, 'red');
  assert.equal(dateMilestoneStatus({ plannedEnd: '2026-10-30', actualDate: '2026-10-31', today: TODAY }).level, 'none');
  assert.equal(dateMilestoneStatus({ plannedEnd: '2026-11-04', actualDate: null, today: TODAY }).level, 'none');

  const result = rollUpOrder({
    stages: [stage('Cutting', 'green', 5)],
    dateMilestones: [{ name: 'PP sample approval', seq: 4, planned_end: '2026-10-30', actual_date: null }],
    today: TODAY,
  });
  assert.equal(result.level, 'red');
  assert.equal(result.headline.kind, 'milestone');
  assert.equal(result.headline.status.overdueDays, 4);
});

test('all stages not started gives grey', () => {
  const result = rollUpOrder({ stages: [stage('Cutting', 'none'), stage('Stitching', 'none')], dateMilestones: [], today: TODAY });
  assert.equal(result.level, 'grey');
});
