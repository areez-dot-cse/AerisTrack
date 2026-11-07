import { query } from '../pool.js';

export async function listBuyers() {
  const { rows } = await query(
    `SELECT b.*, (SELECT count(*) FROM orders o WHERE o.buyer_id = b.id) AS order_count
     FROM buyers b ORDER BY b.name`,
  );
  return rows;
}

export async function findBuyer(id) {
  const { rows } = await query('SELECT * FROM buyers WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listActiveLinks(buyerId) {
  const { rows } = await query(
    `SELECT id, buyer_id, expires_at, created_at FROM buyer_links
     WHERE buyer_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC`,
    [buyerId],
  );
  return rows;
}

export async function insertLink({ buyerId, tokenHash, expiresAt }) {
  const { rows } = await query(
    'INSERT INTO buyer_links (buyer_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, buyer_id, expires_at, created_at',
    [buyerId, tokenHash, expiresAt],
  );
  return rows[0];
}

export async function revokeLink(buyerId, linkId) {
  const { rowCount } = await query(
    'UPDATE buyer_links SET revoked_at = now() WHERE id = $1 AND buyer_id = $2 AND revoked_at IS NULL',
    [linkId, buyerId],
  );
  return rowCount > 0;
}

// The buyer behind a token, or null when the token is unknown, expired or revoked.
export async function findBuyerByTokenHash(tokenHash) {
  const { rows } = await query(
    `SELECT b.* FROM buyer_links l JOIN buyers b ON b.id = l.buyer_id
     WHERE l.token_hash = $1 AND l.revoked_at IS NULL AND l.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}
