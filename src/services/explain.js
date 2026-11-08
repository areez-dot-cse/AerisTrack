// Turns a projection (or an overdue milestone) into the one-line maths shown
// on the board, the detail banner, the buyer page and the Excel export.

export function stageExplanation(projection, { t, fmtDate, fmtQty, unitWord, totalMachines, detailed = false }) {
  const v = projection.explanation?.values ?? {};
  const parts = [];
  switch (projection.state) {
    case 'COMPLETE':
      parts.push(t('proj.complete', { target: fmtQty(v.target) }));
      break;
    case 'NOT_STARTED':
      parts.push(t('proj.notStarted', { start: fmtDate(v.start) }));
      break;
    case 'OVERDUE':
      parts.push(t('proj.overdue', { deadline: fmtDate(v.deadline), remaining: fmtQty(v.remaining), days: v.days }));
      break;
    case 'STOPPED':
      parts.push(t('proj.stopped'));
      if (detailed) parts.push(t('proj.stoppedDetail', { remaining: fmtQty(v.remaining), date: fmtDate(v.date), unit: unitWord }));
      break;
    case 'NO_DATA':
      parts.push(t('proj.noData'));
      if (detailed) parts.push(t('proj.noDataDetail', { done: fmtQty(v.done), target: fmtQty(v.target) }));
      break;
    default: {
      const key = totalMachines ? 'proj.normal' : 'proj.normalNoTotal';
      parts.push(t(key, {
        needed: fmtQty(v.needed), made: fmtQty(v.made), capacity: fmtQty(v.capacity),
        machines: v.machines, total: totalMachines, unit: unitWord, finish: fmtDate(v.finish),
      }));
      if (detailed) {
        parts.push(t('proj.vsDeadline', { deadline: fmtDate(v.deadline) }));
        if (projection.daysLate > 0) parts.push(t('proj.recover', { machines: v.machinesNeeded, unit: unitWord }));
        if (v.closedDays > 0) parts.push(t('proj.closed', { days: v.closedDays }));
      }
    }
  }
  if (projection.stale) parts.push(t('proj.stale', { days: projection.staleDays }));
  return parts.join(' · ');
}

function milestoneExplanation(milestone, status, { t, fmtDate }) {
  return t('proj.milestoneOverdue', { name: milestone.name, days: status.overdueDays, date: fmtDate(milestone.planned_end) });
}

// headline = { kind: 'stage', milestone, projection } | { kind: 'milestone', milestone, status }
export function headlineExplanation(headline, helpers) {
  if (!headline) return helpers.t('proj.noStages');
  if (headline.kind === 'milestone') return milestoneExplanation(headline.milestone, headline.status, helpers);
  const m = headline.milestone;
  return stageExplanation(headline.projection, {
    ...helpers,
    unitWord: helpers.t(`common.${m.capacity_unit ?? 'machines'}`),
    totalMachines: m.total_machines ?? null,
  });
}
