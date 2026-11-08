// Loads orders with their lines, milestones, entries and warnings, runs the
// projection for every quantity stage and rolls each order up to one colour.
// Everything the board, detail page, buyer pages, exports and warnings need.
import { today as clockToday } from './clock.js';
import { listOrders, listLinesForOrders, listMilestonesForOrders } from '../db/queries/orders.js';
import { listEntriesForOrders } from '../db/queries/entries.js';
import { listWarningsForOrders } from '../db/queries/warnings.js';
import { projectStage } from './projection.js';
import { rollUpOrder, dateMilestoneStatus } from './orderStatus.js';
import { isoWeek, percent } from '../lib/format.js';

function groupBy(rows, key) {
  const groups = {};
  for (const row of rows) (groups[row[key]] ??= []).push(row);
  return groups;
}

export async function loadSummaries({ buyerId = null, orderId = null } = {}) {
  const today = clockToday();
  const orders = await listOrders({ buyerId, orderId });
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const [lines, milestones, entries, warnings] = await Promise.all([
    listLinesForOrders(ids),
    listMilestonesForOrders(ids),
    listEntriesForOrders(ids),
    listWarningsForOrders(ids, ['detected', 'confirmed']),
  ]);
  const linesBy = groupBy(lines, 'order_id');
  const milestonesBy = groupBy(milestones, 'order_id');
  const entriesBy = groupBy(entries, 'order_milestone_id');
  const warningsBy = groupBy(warnings, 'order_id');
  return orders.map((order) => buildSummary({
    order,
    lines: linesBy[order.id] ?? [],
    milestones: milestonesBy[order.id] ?? [],
    entriesByStage: entriesBy,
    warnings: warningsBy[order.id] ?? [],
    today,
  }));
}

export async function loadSummary(orderId) {
  const [summary] = await loadSummaries({ orderId });
  return summary ?? null;
}

function buildSummary({ order, lines, milestones, entriesByStage, warnings, today }) {
  const stages = [];
  const dateMilestones = [];
  const detailedMilestones = milestones.map((m) => {
    if (m.kind === 'quantity') {
      const rows = entriesByStage[m.id] ?? [];
      const done = rows.reduce((sum, e) => sum + e.pieces, 0);
      const projection = projectStage({
        target: m.target_qty,
        done,
        plannedStart: m.planned_start,
        deadline: m.planned_end,
        today,
        entries: rows.map((e) => ({ date: e.entry_date, pieces: e.pieces, machines: e.machines, closedUntil: e.closed_until })),
      });
      const stage = { ...m, done, projection, entries: rows, recentEntries: rows.slice(-7).reverse() };
      stages.push(stage);
      return stage;
    }
    const status = dateMilestoneStatus({ plannedEnd: m.planned_end, actualDate: m.actual_date, today });
    const milestone = { ...m, status };
    dateMilestones.push(milestone);
    return milestone;
  });

  const { level, headline } = rollUpOrder({
    stages: stages.map((s) => ({ milestone: s, projection: s.projection })),
    dateMilestones,
    today,
  });

  const totalDone = stages.reduce((sum, s) => sum + s.done, 0);
  const totalTarget = stages.reduce((sum, s) => sum + s.target_qty, 0);
  const currentStage = stages.find((s) => s.done < s.target_qty) ?? null;
  const colours = [...new Set(lines.map((l) => l.colour))];
  const sizes = [...new Set(lines.map((l) => l.size))];

  return {
    ...order,
    total_qty: Number(order.total_qty),
    lines,
    colours,
    sizes,
    milestones: detailedMilestones,
    stages,
    dateMilestones,
    level,
    headline,
    currentStage,
    allComplete: stages.length > 0 && !currentStage,
    totalDone,
    totalTarget,
    progressPct: percent(totalDone, totalTarget),
    unitIds: [...new Set(stages.map((s) => s.unit_id).filter(Boolean))],
    shipWeek: isoWeek(order.ex_factory_date),
    detectedWarning: warnings.find((w) => w.status === 'detected') ?? null,
    confirmedWarnings: warnings.filter((w) => w.status === 'confirmed'),
    today,
  };
}

// The maths frozen into a warning: the headline stage's projection plus context.
export function buildSnapshot(summary) {
  const h = summary.headline;
  const base = { po: summary.po_number, style: summary.style, level: summary.level, today: summary.today, kind: h?.kind ?? null };
  if (!h) return base;
  if (h.kind === 'milestone') {
    return { ...base, milestone: h.milestone.name, plannedEnd: h.milestone.planned_end, overdueDays: h.status.overdueDays };
  }
  const m = h.milestone;
  return {
    ...base,
    stage: m.name,
    milestoneId: m.id,
    floor: m.floor_name ? `${m.unit_name} · ${m.floor_name}` : null,
    capacityUnit: m.capacity_unit ?? 'machines',
    totalMachines: m.total_machines ?? null,
    target: m.target_qty,
    done: m.done,
    deadline: m.planned_end,
    projection: h.projection,
  };
}
