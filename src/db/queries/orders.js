import { query, withTransaction } from '../pool.js';

const ORDER_SELECT = `
  SELECT o.*, b.name AS buyer_name, b.country AS buyer_country,
         (SELECT coalesce(sum(quantity), 0) FROM order_lines l WHERE l.order_id = o.id) AS total_qty
  FROM orders o JOIN buyers b ON b.id = o.buyer_id`;

export async function listOrders({ buyerId = null, orderId = null } = {}) {
  const conditions = [];
  const params = [];
  if (buyerId != null) { params.push(buyerId); conditions.push(`o.buyer_id = $${params.length}`); }
  if (orderId != null) { params.push(orderId); conditions.push(`o.id = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${ORDER_SELECT} ${where} ORDER BY o.ex_factory_date, o.po_number`, params);
  return rows;
}

export async function findOrder(id) {
  const { rows } = await query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function poNumberExists(poNumber) {
  const { rows } = await query('SELECT 1 FROM orders WHERE po_number = $1', [poNumber]);
  return rows.length > 0;
}

export async function listLinesForOrders(orderIds) {
  const { rows } = await query(
    'SELECT * FROM order_lines WHERE order_id = ANY($1) ORDER BY order_id, id',
    [orderIds],
  );
  return rows;
}

export async function listMilestonesForOrders(orderIds) {
  const { rows } = await query(
    `SELECT m.*, f.name AS floor_name, f.total_machines, f.capacity_unit, f.supervisor_id,
            u.id AS unit_id, u.name AS unit_name, u.kind AS unit_kind
     FROM order_milestones m
     LEFT JOIN floors f ON f.id = m.floor_id
     LEFT JOIN units u ON u.id = f.unit_id
     WHERE m.order_id = ANY($1)
     ORDER BY m.order_id, m.seq`,
    [orderIds],
  );
  return rows;
}

export async function findMilestone(id) {
  const { rows } = await query(
    `SELECT m.*, f.name AS floor_name, f.total_machines, f.capacity_unit, f.supervisor_id,
            u.name AS unit_name, u.kind AS unit_kind, o.po_number, o.buyer_id
     FROM order_milestones m
     JOIN orders o ON o.id = m.order_id
     LEFT JOIN floors f ON f.id = m.floor_id
     LEFT JOIN units u ON u.id = f.unit_id
     WHERE m.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Creates the order, its colour/size lines and its own copy of the milestones.
export function createOrder({ order, lines, milestones }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO orders (po_number, buyer_id, style, ex_factory_date, template_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [order.poNumber, order.buyerId, order.style, order.exFactoryDate, order.templateName, order.createdBy],
    );
    const created = rows[0];
    for (const line of lines) {
      await client.query(
        'INSERT INTO order_lines (order_id, colour, size, quantity) VALUES ($1, $2, $3, $4)',
        [created.id, line.colour, line.size, line.quantity],
      );
    }
    for (const m of milestones) {
      await client.query(
        `INSERT INTO order_milestones (order_id, seq, name, kind, planned_start, planned_end, floor_id, target_qty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [created.id, m.seq, m.name, m.kind, m.plannedStart ?? null, m.plannedEnd, m.floorId ?? null, m.targetQty ?? null],
      );
    }
    return created;
  });
}

export async function updateExFactory(client, orderId, newDate) {
  await client.query('UPDATE orders SET ex_factory_date = $2 WHERE id = $1', [orderId, newDate]);
}

export async function updateMilestoneDates(client, milestoneId, { plannedStart, plannedEnd }) {
  await client.query(
    'UPDATE order_milestones SET planned_start = coalesce($2, planned_start), planned_end = coalesce($3, planned_end) WHERE id = $1',
    [milestoneId, plannedStart ?? null, plannedEnd ?? null],
  );
}

export async function setMilestoneActual(client, milestoneId, actualDate) {
  await client.query('UPDATE order_milestones SET actual_date = $2 WHERE id = $1', [milestoneId, actualDate]);
}

// Stages on one floor that still have pieces to make (the supervisor's Today list).
export async function listOpenStagesForFloor(floorId) {
  const { rows } = await query(
    `SELECT m.*, o.po_number, o.style, o.ex_factory_date, b.name AS buyer_name,
            coalesce((SELECT sum(e.pieces) FROM daily_entries e WHERE e.order_milestone_id = m.id), 0) AS done
     FROM order_milestones m
     JOIN orders o ON o.id = m.order_id
     JOIN buyers b ON b.id = o.buyer_id
     WHERE m.floor_id = $1 AND m.kind = 'quantity'
     ORDER BY m.planned_end, o.po_number`,
    [floorId],
  );
  return rows.filter((row) => row.done < row.target_qty);
}
