// Weekly status workbook per buyer. The buyer version shows only confirmed
// warnings; the office version shows the live colour too.
import ExcelJS from 'exceljs';
import { today as clockToday } from './clock.js';
import { addDays } from './workdays.js';
import { loadSummaries } from './orderSummary.js';
import { listDateChangesForBuyerSince } from '../db/queries/dateChanges.js';
import { isoWeek } from '../lib/format.js';
import { makeT } from '../middleware/i18n.js';

export function weeklyFilename(buyer) {
  return `${buyer.name.replace(/[^A-Za-z0-9]+/g, '')}_status_${isoWeek(clockToday())}.xlsx`;
}

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F0' } };
  for (const row of rows) sheet.addRow(row);
  return sheet;
}

function stageState(stage, t) {
  const p = stage.projection;
  if (p.state === 'COMPLETE') return t('export.complete');
  if (p.state === 'NOT_STARTED') return t('export.notStarted');
  return t('export.running');
}

function milestoneState(m, t) {
  if (m.actual_date) return t('export.done');
  return m.status.level === 'none' ? t('export.pending') : t('export.overdue');
}

async function buildWeeklyWorkbook(buyer, { forBuyer }) {
  const t = makeT('en');
  const today = clockToday();
  const summaries = await loadSummaries({ buyerId: buyer.id });
  const changes = await listDateChangesForBuyerSince(buyer.id, addDays(today, -7));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Company A';
  workbook.created = new Date();

  addSheet(workbook, t('export.summary'), [
    { header: t('export.po'), key: 'po', width: 14 }, { header: t('export.style'), key: 'style', width: 34 },
    { header: t('export.qty'), key: 'qty', width: 10 }, { header: t('export.exFactory'), key: 'ex', width: 12 },
    { header: t('export.currentStage'), key: 'stage', width: 16 }, { header: t('export.doneTarget'), key: 'done', width: 16 },
    { header: t('export.progress'), key: 'pct', width: 11 }, { header: t('export.status'), key: 'status', width: 24 },
  ], summaries.map((o) => {
    const confirmed = o.confirmedWarnings[0] ?? null;
    const status = forBuyer
      ? (confirmed ? `${t('buyer.warningBadge')}: ${t('status.' + confirmed.level)}` : '')
      : t('status.' + o.level);
    return {
      po: o.po_number, style: o.style, qty: o.total_qty, ex: o.ex_factory_date,
      stage: o.currentStage ? o.currentStage.name : t('buyer.complete'),
      done: o.currentStage ? `${o.currentStage.done} / ${o.currentStage.target_qty}` : `${o.totalDone} / ${o.totalTarget}`,
      pct: o.progressPct / 100, status,
    };
  })).getColumn('pct').numFmt = '0%';

  addSheet(workbook, t('export.milestones'), [
    { header: t('export.po'), key: 'po', width: 14 }, { header: t('export.milestone'), key: 'name', width: 22 },
    { header: t('export.planned'), key: 'planned', width: 24 }, { header: t('export.actual'), key: 'actual', width: 12 },
    { header: t('export.state'), key: 'state', width: 14 },
  ], summaries.flatMap((o) => o.milestones.map((m) => ({
    po: o.po_number, name: m.name,
    planned: m.kind === 'quantity' ? `${m.planned_start} → ${m.planned_end}` : m.planned_end,
    actual: m.kind === 'quantity' ? (m.projection.state === 'COMPLETE' ? (m.entries[m.entries.length - 1]?.entry_date ?? '') : '') : (m.actual_date ?? ''),
    state: m.kind === 'quantity' ? stageState(m, t) : milestoneState(m, t),
  }))));

  addSheet(workbook, t('export.dateChanges'), [
    { header: t('export.po'), key: 'po', width: 14 }, { header: t('export.field'), key: 'field', width: 28 },
    { header: t('export.old'), key: 'old', width: 12 }, { header: t('export.new'), key: 'new', width: 12 },
    { header: t('export.reason'), key: 'reason', width: 44 }, { header: t('export.when'), key: 'when', width: 20 },
  ], changes.length ? changes.map((c) => ({
    po: c.po_number, field: `${c.milestone_name ? `${c.milestone_name} · ` : ''}${t('order.field_' + c.field)}`,
    old: c.old_value ?? '', new: c.new_value ?? '', reason: c.reason, when: new Date(c.changed_at).toISOString().slice(0, 16).replace('T', ' '),
  })) : [{ po: t('export.noChanges') }]);

  const confirmed = summaries.flatMap((o) => o.confirmedWarnings.map((w) => ({ o, w })));
  addSheet(workbook, t('export.warnings'), [
    { header: t('export.po'), key: 'po', width: 14 }, { header: t('export.level'), key: 'level', width: 10 },
    { header: t('export.stage'), key: 'stage', width: 20 }, { header: t('export.needPerDay'), key: 'need', width: 12 },
    { header: t('export.capacityPerDay'), key: 'cap', width: 14 }, { header: t('export.expectedFinish'), key: 'finish', width: 16 },
    { header: t('export.reason'), key: 'reason', width: 24 }, { header: t('export.note'), key: 'note', width: 50 },
  ], confirmed.length ? confirmed.map(({ o, w }) => {
    const s = w.snapshot;
    const p = s.projection ?? {};
    return {
      po: o.po_number, level: t('status.' + w.level), stage: s.stage ?? s.milestone ?? '',
      need: p.neededPerDay ?? '', cap: p.capacityPerDay != null ? Math.round(p.capacityPerDay) : '',
      finish: p.expectedFinish ?? (p.state === 'STOPPED' ? t('proj.stopped') : ''),
      reason: w.reason_category ? t('categories.' + w.reason_category) : '', note: w.note_for_buyer ?? '',
    };
  }) : [{ po: t('export.none') }]);

  return workbook;
}

export async function sendWeeklyExcel(res, buyer, { forBuyer }) {
  const workbook = await buildWeeklyWorkbook(buyer, { forBuyer });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${weeklyFilename(buyer)}"`);
  res.set('Cache-Control', 'no-store');
  await workbook.xlsx.write(res);
  res.end();
}
