import { query } from '../pool.js';

export async function insertMedia(client, { kind, mime, bytes, orderId, entryId = null, sharedWithBuyer = true }) {
  const { rows } = await client.query(
    `INSERT INTO media (kind, mime, bytes, size_bytes, order_id, entry_id, shared_with_buyer)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, kind, mime, size_bytes, order_id, entry_id, shared_with_buyer, created_at`,
    [kind, mime, bytes, bytes.length, orderId, entryId, sharedWithBuyer],
  );
  return rows[0];
}

// Metadata plus the floor of the entry, for the access check. Bytes are loaded separately.
export async function findMediaMeta(id) {
  const { rows } = await query(
    `SELECT md.id, md.kind, md.mime, md.size_bytes, md.order_id, md.entry_id, md.shared_with_buyer, md.created_at,
            m.floor_id, o.buyer_id
     FROM media md
     JOIN orders o ON o.id = md.order_id
     LEFT JOIN daily_entries e ON e.id = md.entry_id
     LEFT JOIN order_milestones m ON m.id = e.order_milestone_id
     WHERE md.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findMediaBytes(id) {
  const { rows } = await query('SELECT mime, bytes FROM media WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listPhotosForOrders(orderIds, { sharedOnly = false } = {}) {
  const { rows } = await query(
    `SELECT md.id, md.order_id, md.entry_id, md.shared_with_buyer, md.created_at, md.mime,
            e.entry_date, m.name AS stage_name, f.name AS floor_name, u.name AS unit_name
     FROM media md
     LEFT JOIN daily_entries e ON e.id = md.entry_id
     LEFT JOIN order_milestones m ON m.id = e.order_milestone_id
     LEFT JOIN floors f ON f.id = m.floor_id
     LEFT JOIN units u ON u.id = f.unit_id
     WHERE md.kind = 'photo' AND md.order_id = ANY($1) ${sharedOnly ? 'AND md.shared_with_buyer' : ''}
     ORDER BY md.created_at DESC`,
    [orderIds],
  );
  return rows;
}

export async function setMediaShared(id, orderId, shared) {
  const { rowCount } = await query(
    'UPDATE media SET shared_with_buyer = $3 WHERE id = $1 AND order_id = $2',
    [id, orderId, shared],
  );
  return rowCount > 0;
}
