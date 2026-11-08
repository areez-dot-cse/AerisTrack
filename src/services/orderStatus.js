// Rolls stage projections and date milestones up to one colour per order.
// Pure: takes already-computed projections, returns the level and the
// "headline" item that set it (shown on the board row).
import { workingDaysBetween } from './workdays.js';

export const LEVEL_RANK = { red: 3, amber: 2, grey: 1, green: 0, none: -1 };

export function worstLevel(levels) {
  const real = levels.filter((level) => level !== 'none');
  if (real.length === 0) return 'grey';
  return real.reduce((worst, level) => (LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst));
}

// A date milestone is overdue when its planned date has passed with no actual date.
// 1–2 working days late is amber, more than 2 is red.
export function dateMilestoneStatus({ plannedEnd, actualDate, today }) {
  if (actualDate) return { level: 'none', overdueDays: 0, done: true };
  if (plannedEnd >= today) return { level: 'none', overdueDays: 0, done: false };
  const overdueDays = workingDaysBetween(plannedEnd, today);
  return { level: overdueDays > 2 ? 'red' : 'amber', overdueDays, done: false };
}

// stages: [{ milestone, projection }], milestones: [{ milestone, status }]
export function rollUpOrder({ stages, dateMilestones, today }) {
  const stageLevels = stages.map((s) => s.projection.level);
  const milestoneItems = dateMilestones.map((m) => ({
    kind: 'milestone',
    milestone: m,
    status: dateMilestoneStatus({ plannedEnd: m.planned_end, actualDate: m.actual_date, today }),
  }));
  const level = worstLevel([...stageLevels, ...milestoneItems.map((m) => m.status.level)]);

  // Headline: a stage at the worst level wins over a milestone; a running stage
  // beats a finished one, and the earliest seq wins ties.
  const atLevel = stages.filter((s) => s.projection.level === level);
  const stageAtLevel = atLevel.find((s) => s.projection.state !== 'COMPLETE') ?? atLevel[atLevel.length - 1];
  if (stageAtLevel) return { level, headline: { kind: 'stage', ...stageAtLevel } };
  const milestoneAtLevel = milestoneItems.find((m) => m.status.level === level);
  if (milestoneAtLevel) return { level, headline: milestoneAtLevel };
  // Everything is "none": show the first stage so the row still says something.
  const first = stages[0];
  return { level, headline: first ? { kind: 'stage', ...first } : null };
}

export const LEVEL_ORDER = ['red', 'amber', 'grey', 'green'];
