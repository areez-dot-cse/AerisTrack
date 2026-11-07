import { query } from '../pool.js';

const CHANGE_SELECT = `
  SELECT c.*, u.name AS changed_by_name, m.name AS milestone_name, o.po_number
  FROM date_changes c
  JOIN users u ON u.id = c.changed_by
  JOIN orders o ON o.id = c.order_id
  LEFT JOIN order_milestones m ON m.id = c.order_milestone_id`;

export async function insertDateChange(client, change) {
  const { rows } = await client.query(
    `INSERT INTO date_changes (order_id, order_milestone_id, field, old_value, new_value, reason, changed_by, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now())) RETURNING *`,
    [change.orderId, change.milestoneId ?? null, change.field, change.oldValue ?? null, change.newValue ?? null,
      change.reason, change.changedBy, change.changedAt ?? null],
  );
  return rows[0];
}

export async function listDateChangesForOrder(orderId) {
  const { rows } = await query(`${CHANGE_SELECT} WHERE c.order_id = $1 ORDER BY c.changed_at DESC, c.id DESC`, [orderId]);
  return rows;
}

export async function listDateChangesForBuyerSince(buyerId, since) {
  const { rows } = await query(
    `${CHANGE_SELECT} WHERE o.buyer_id = $1 AND c.changed_at >= $2 ORDER BY c.changed_at DESC`,
    [buyerId, since],
  );
  return rows;
}
