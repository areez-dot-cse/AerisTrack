import { query } from '../pool.js';

export async function findUserById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND role = $2', [email.toLowerCase(), 'merchandiser']);
  return rows[0] ?? null;
}

export async function findUserByPhone(phone) {
  const { rows } = await query('SELECT * FROM users WHERE phone = $1 AND role = $2', [phone, 'supervisor']);
  return rows[0] ?? null;
}

export async function updateUserLanguage(id, language) {
  await query('UPDATE users SET language = $2 WHERE id = $1', [id, language]);
}
