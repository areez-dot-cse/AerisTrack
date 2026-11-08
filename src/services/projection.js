// The delay engine. Pure functions, no database.
//
// Formula (per quantity stage, judged against the stage's own deadline):
//
//   pieces_per_machine = sum(pieces) ÷ sum(machines) over the last 3 entries with machines > 0
//   machines_now       = latest entry's machines; if that is 0 and the unit is reopening,
//                        use the last non-zero machine count
//   capacity_per_day   = machines_now × pieces_per_machine
//   remaining          = target − done
//   days_left          = workingDaysBetween(today, deadline)
//   needed_per_day     = ceil(remaining ÷ days_left)        (if days_left = 0 → remaining)
//   closed_days        = workingDaysBetween(today, closed_until) if closed_until > today, else 0
//   days_to_finish     = ceil(remaining ÷ capacity_per_day)
//   expected_finish    = addWorkingDays(today, closed_days + days_to_finish)
//   days_late          = workingDaysBetween(deadline, expected_finish)
//   machines_needed    = ceil(needed_per_day ÷ pieces_per_machine)
//
// `done` includes today's entry. `today` always comes from clock.today().
import { workingDaysBetween, addWorkingDays } from './workdays.js';

const STALE_AFTER_WORKING_DAYS = 2;

export function projectStage({ target, done, plannedStart, deadline, today, entries = [] }) {
  const remaining = target - done;
  const latest = entries[entries.length - 1] ?? null;
  const lastEntryDate = latest?.date ?? null;
  const daysLeft = workingDaysBetween(today, deadline);
  const neededPerDay = remaining <= 0 ? 0 : daysLeft === 0 ? remaining : Math.ceil(remaining / daysLeft);

  const result = {
    state: null,
    level: null,
    stale: false,
    staleDays: 0,
    remaining,
    daysLeft,
    neededPerDay,
    piecesPerMachine: null,
    machinesNow: null,
    capacityPerDay: null,
    closedDays: 0,
    daysToFinish: null,
    expectedFinish: null,
    daysLate: 0,
    machinesNeeded: null,
    madeToday: entries.find((e) => e.date === today)?.pieces ?? 0,
    lastEntryDate,
    explanation: null,
  };

  // 1. Nothing left to make.
  if (remaining <= 0) {
    return finish(result, 'COMPLETE', 'green', { key: 'proj.complete', values: { target } });
  }

  // 2. Not due to start yet and nothing entered: ignored in the order colour.
  if (today < plannedStart && entries.length === 0) {
    return finish(result, 'NOT_STARTED', 'none', { key: 'proj.notStarted', values: { start: plannedStart } });
  }

  // 3. Past the deadline with pieces still to make.
  if (today > deadline) {
    result.daysLate = workingDaysBetween(deadline, today);
    return withStale(finish(result, 'OVERDUE', 'red', {
      key: 'proj.overdue', values: { deadline, remaining, days: result.daysLate },
    }), lastEntryDate, plannedStart, today);
  }

  // 4. Stopped with no idea when it restarts: the "infinity" case.
  if (latest && latest.machines === 0 && !latest.closedUntil) {
    return finish(result, 'STOPPED', 'red', {
      key: 'proj.stopped', values: { remaining, date: latest.date },
    });
  }

  // 5. The rate needs at least two working entries.
  const working = entries.filter((e) => e.machines > 0);
  if (working.length < 2) {
    return withStale(finish(result, 'NO_DATA', 'grey', {
      key: 'proj.noData', values: { done, target },
    }), lastEntryDate, plannedStart, today);
  }

  const recent = working.slice(-3);
  const sumPieces = recent.reduce((sum, e) => sum + e.pieces, 0);
  const sumMachines = recent.reduce((sum, e) => sum + e.machines, 0);
  const piecesPerMachine = sumPieces / sumMachines;
  const machinesNow = latest.machines > 0 ? latest.machines : working[working.length - 1].machines;
  const capacityPerDay = machinesNow * piecesPerMachine;
  Object.assign(result, { piecesPerMachine, machinesNow, capacityPerDay });

  // 6. Machines ran but made nothing: no finish date either.
  if (capacityPerDay <= 0) {
    return finish(result, 'STOPPED', 'red', {
      key: 'proj.stopped', values: { remaining, date: latest.date },
    });
  }

  // 7. The formula.
  const closedUntil = latest.closedUntil ?? null;
  result.closedDays = closedUntil && closedUntil > today ? workingDaysBetween(today, closedUntil) : 0;
  result.daysToFinish = Math.ceil(remaining / capacityPerDay);
  result.expectedFinish = addWorkingDays(today, result.closedDays + result.daysToFinish);
  result.daysLate = workingDaysBetween(deadline, result.expectedFinish);
  result.machinesNeeded = Math.ceil(neededPerDay / piecesPerMachine);

  const explanation = {
    key: 'proj.normal',
    values: {
      needed: neededPerDay,
      made: result.madeToday,
      capacity: Math.round(capacityPerDay),
      machines: machinesNow,
      finish: result.expectedFinish,
      deadline,
      machinesNeeded: result.machinesNeeded,
      closedDays: result.closedDays,
    },
  };
  let state = 'ON_TRACK';
  let level = 'green';
  if (result.daysLate > 2) { state = 'LATE'; level = 'red'; }
  else if (result.daysLate >= 1) { state = 'AT_RISK'; level = 'amber'; }

  // 8. No news is bad news: a green or grey result with no recent entry turns amber.
  return withStale(finish(result, state, level, explanation), lastEntryDate, plannedStart, today);
}

function finish(result, state, level, explanation) {
  return Object.assign(result, { state, level, explanation });
}

function withStale(result, lastEntryDate, plannedStart, today) {
  const since = lastEntryDate ?? plannedStart;
  const staleDays = workingDaysBetween(since, today);
  if (staleDays > STALE_AFTER_WORKING_DAYS) {
    result.stale = true;
    result.staleDays = staleDays;
    if (result.level === 'green' || result.level === 'grey') result.level = 'amber';
  }
  return result;
}
