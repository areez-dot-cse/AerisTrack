import { query } from '../pool.js';

export async function listEntriesForOrders(orderIds) {
  const { rows } = await query(
    `SELECT e.*, u.name AS entered_by_name
     FROM daily_entries e
     JOIN order_milestones m ON m.id = e.order_milestone_id
     LEFT JOIN users u ON u.id = e.entered_by
     WHERE m.order_id = ANY($1)
     ORDER BY e.order_milestone_id, e.entry_date`,
    [orderIds],
  );
  return rows;
}

export async function listEntriesForMilestone(milestoneId) {
  const { rows } = await query(
    'SELECT * FROM daily_entries WHERE order_milestone_id = $1 ORDER BY entry_date',
    [milestoneId],
  );
  return rows;
}

export async function findEntryByUuid(clientUuid) {
  const { rows } = await query('SELECT * FROM daily_entries WHERE client_uuid = $1', [clientUuid]);
  return rows[0] ?? null;
}

export async function findEntryByDate(milestoneId, entryDate) {
  const { rows } = await query(
    'SELECT * FROM daily_entries WHERE order_milestone_id = $1 AND entry_date = $2',
    [milestoneId, entryDate],
  );
  return rows[0] ?? null;
}

// Machines already booked on this floor and date by other stages.
export async function machinesUsedOnFloor(floorId, entryDate, excludeMilestoneId) {
  const { rows } = await query(
    `SELECT coalesce(sum(e.machines), 0) AS used
     FROM daily_entries e JOIN order_milestones m ON m.id = e.order_milestone_id
     WHERE m.floor_id = $1 AND e.entry_date = $2 AND m.id <> $3`,
    [floorId, entryDate, excludeMilestoneId],
  );
  return rows[0].used;
}

// One row per stage and date. A second submit for the same date overwrites the first.
export async function upsertEntry(client, entry) {
  const { rows } = await client.query(
    `INSERT INTO daily_entries
       (order_milestone_id, entry_date, pieces, machines, closed_until, supervisor_id, entered_by, client_uuid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (order_milestone_id, entry_date) DO UPDATE SET
       pieces = EXCLUDED.pieces, machines = EXCLUDED.machines, closed_until = EXCLUDED.closed_until,
       supervisor_id = EXCLUDED.supervisor_id, entered_by = EXCLUDED.entered_by,
       client_uuid = EXCLUDED.client_uuid, updated_at = now()
     RETURNING *`,
    [entry.milestoneId, entry.entryDate, entry.pieces, entry.machines, entry.closedUntil ?? null,
      entry.supervisorId ?? null, entry.enteredBy, entry.clientUuid ?? null],
  );
  return rows[0];
}
