// Applies every numbered .sql file in ./migrations that is not yet recorded
// in the `migrations` table. Each file runs inside one transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query('SELECT name FROM migrations');
  const applied = new Set(rows.map((row) => row.name));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
    });
    console.log(`applied ${file}`);
  }
  if (pending.length === 0) console.log('database is up to date');
  return pending;
}

const runDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (runDirectly) {
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
