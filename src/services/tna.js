// Turns a template into dated milestones for one order.
// Offsets are calendar days before the ex-factory date (assumption A7).
import { addDays } from './workdays.js';

export function milestonesFromTemplate(template, exFactoryDate, { totalQty, floorByName = {} } = {}) {
  return template.milestones.map((m, index) => {
    const base = {
      seq: index + 1,
      name: m.name,
      kind: m.kind,
      plannedEnd: addDays(exFactoryDate, -m.end_offset_days),
    };
    if (m.kind === 'date') return base;
    return {
      ...base,
      plannedStart: addDays(exFactoryDate, -m.start_offset_days),
      floorId: floorByName[m.name] ?? null,
      targetQty: totalQty,
    };
  });
}
