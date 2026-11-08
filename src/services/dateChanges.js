// Every date change is written to the append-only history with a reason,
// then the order's warning is refreshed.
import { withTransaction } from '../db/pool.js';
import { updateExFactory, updateMilestoneDates, setMilestoneActual } from '../db/queries/orders.js';
import { insertDateChange } from '../db/queries/dateChanges.js';
import { refreshWarning } from './warnings.js';

export async function changeExFactory(order, { newDate, reason, user }) {
  await withTransaction(async (client) => {
    await updateExFactory(client, order.id, newDate);
    await insertDateChange(client, {
      orderId: order.id, field: 'ex_factory', oldValue: order.ex_factory_date, newValue: newDate, reason, changedBy: user.id,
    });
  });
  await refreshWarning(order.id);
}

export async function changePlannedDates(milestone, { plannedStart, plannedEnd, reason, user }) {
  await withTransaction(async (client) => {
    await updateMilestoneDates(client, milestone.id, { plannedStart, plannedEnd });
    if (plannedStart && plannedStart !== milestone.planned_start) {
      await insertDateChange(client, {
        orderId: milestone.order_id, milestoneId: milestone.id, field: 'planned_start',
        oldValue: milestone.planned_start, newValue: plannedStart, reason, changedBy: user.id,
      });
    }
    if (plannedEnd !== milestone.planned_end) {
      await insertDateChange(client, {
        orderId: milestone.order_id, milestoneId: milestone.id, field: 'planned_end',
        oldValue: milestone.planned_end, newValue: plannedEnd, reason, changedBy: user.id,
      });
    }
  });
  await refreshWarning(milestone.order_id);
}

export async function markMilestoneDone(milestone, { actualDate, reason, user }) {
  await withTransaction(async (client) => {
    await setMilestoneActual(client, milestone.id, actualDate);
    await insertDateChange(client, {
      orderId: milestone.order_id, milestoneId: milestone.id, field: 'actual_date',
      oldValue: milestone.actual_date, newValue: actualDate, reason, changedBy: user.id,
    });
  });
  await refreshWarning(milestone.order_id);
}
