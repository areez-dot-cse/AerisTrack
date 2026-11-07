import { query } from '../pool.js';

const FLOOR_SELECT = `
  SELECT f.*, u.name AS unit_name, u.kind AS unit_kind, s.name AS supervisor_name
  FROM floors f
  JOIN units u ON u.id = f.unit_id
  LEFT JOIN users s ON s.id = f.supervisor_id`;

export async function listFloors() {
  const { rows } = await query(`${FLOOR_SELECT} ORDER BY u.id, f.id`);
  return rows;
}

export async function findFloorBySupervisor(userId) {
  const { rows } = await query(`${FLOOR_SELECT} WHERE f.supervisor_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function listUnits() {
  const { rows } = await query('SELECT * FROM units ORDER BY id');
  return rows;
}
