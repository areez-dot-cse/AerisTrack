import { query } from '../pool.js';

const WARNING_SELECT = `
  SELECT w.*, o.po_number, o.style, o.buyer_id, b.name AS buyer_name, d.name AS decided_by_name
  FROM warnings w
  JOIN orders o ON o.id = w.order_id
  JOIN buyers b ON b.id = o.buyer_id
  LEFT JOIN users d ON d.id = w.decided_by`;

export async function findLatestWarning(orderId) {
  const { rows } = await query(`${WARNING_SELECT} WHERE w.order_id = $1 ORDER BY w.id DESC LIMIT 1`, [orderId]);
  return rows[0] ?? null;
}

export async function findWarning(id) {
  const { rows } = await query(`${WARNING_SELECT} WHERE w.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertWarning({ orderId, level, snapshot }) {
  const { rows } = await query(
    `INSERT INTO warnings (order_id, level, status, snapshot) VALUES ($1, $2, 'detected', $3) RETURNING *`,
    [orderId, level, JSON.stringify(snapshot)],
  );
  return rows[0];
}

export async function updateDetectedWarning(id, { level, snapshot }) {
  await query(
    `UPDATE warnings SET level = $2, snapshot = $3, detected_at = now() WHERE id = $1 AND status = 'detected'`,
    [id, level, JSON.stringify(snapshot)],
  );
}

export async function resolveWarning(id) {
  await query(`UPDATE warnings SET status = 'resolved', resolved_at = now() WHERE id = $1`, [id]);
}

export async function confirmWarningRow(id, { userId, reasonCategory, noteForBuyer, snapshot }) {
  const { rowCount } = await query(
    `UPDATE warnings SET status = 'confirmed', reason_category = $2, note_for_buyer = $3, snapshot = $4,
       decided_by = $5, decided_at = now()
     WHERE id = $1 AND status = 'detected'`,
    [id, reasonCategory, noteForBuyer, JSON.stringify(snapshot), userId],
  );
  return rowCount > 0;
}

export async function dismissWarningRow(id, { userId, reason }) {
  const { rowCount } = await query(
    `UPDATE warnings SET status = 'dismissed', dismiss_reason = $2, decided_by = $3, decided_at = now()
     WHERE id = $1 AND status = 'detected'`,
    [id, reason, userId],
  );
  return rowCount > 0;
}

export async function listDetectedWarnings() {
  const { rows } = await query(`${WARNING_SELECT} WHERE w.status = 'detected' ORDER BY w.level = 'red' DESC, w.detected_at DESC`);
  return rows;
}

export async function countDetectedWarnings() {
  const { rows } = await query(`SELECT count(*) AS count FROM warnings WHERE status = 'detected'`);
  return rows[0].count;
}

export async function listWarningsForOrders(orderIds, statuses) {
  const { rows } = await query(
    `${WARNING_SELECT} WHERE w.order_id = ANY($1) AND w.status = ANY($2) ORDER BY w.id DESC`,
    [orderIds, statuses],
  );
  return rows;
}
