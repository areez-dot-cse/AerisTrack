import test from 'node:test';
import assert from 'node:assert/strict';
import { milestonesFromTemplate } from '../../src/services/tna.js';

const template = {
  milestones: [
    { name: 'Order confirmation', kind: 'date', start_offset_days: null, end_offset_days: 60 },
    { name: 'Cutting', kind: 'quantity', start_offset_days: 36, end_offset_days: 22 },
    { name: 'Stitching', kind: 'quantity', start_offset_days: 30, end_offset_days: 6 },
  ],
};

test('offsets are calendar days before the ex-factory date; quantity stages get a floor and the order total', () => {
  const result = milestonesFromTemplate(template, '2026-11-20', { totalQty: 12000, floorByName: { Cutting: 4, Stitching: 1 } });
  assert.deepEqual(result, [
    { seq: 1, name: 'Order confirmation', kind: 'date', plannedEnd: '2026-09-21' },
    { seq: 2, name: 'Cutting', kind: 'quantity', plannedEnd: '2026-10-29', plannedStart: '2026-10-15', floorId: 4, targetQty: 12000 },
    { seq: 3, name: 'Stitching', kind: 'quantity', plannedEnd: '2026-11-14', plannedStart: '2026-10-21', floorId: 1, targetQty: 12000 },
  ]);
});

test('a stage with no floor chosen is left for validation to catch', () => {
  const [, cutting] = milestonesFromTemplate(template, '2026-11-20', { totalQty: 100, floorByName: {} });
  assert.equal(cutting.floorId, null);
});
