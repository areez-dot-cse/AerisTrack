import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings. A JS Date would shift by
// the server's timezone and every date calculation in the app works on strings.
pg.types.setTypeParser(1082, (value) => value);
// COUNT/SUM come back as int8 and NUMERIC as strings by default; we want numbers.
pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1700, (value) => Number(value));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export function query(text, params = []) {
  return pool.query(text, params);
}

// Runs `fn(client)` inside a transaction and rolls back if it throws.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
