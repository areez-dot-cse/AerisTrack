// Read-only buyer links. The token is 32 random bytes; only its SHA-256 hash is
// stored, so a database leak does not leak working links.
import crypto from 'node:crypto';
import { insertLink, findBuyerByTokenHash } from '../db/queries/buyers.js';

export const LINK_DAYS = 90;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createBuyerLink(buyerId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 3600 * 1000);
  const link = await insertLink({ buyerId, tokenHash: hashToken(token), expiresAt });
  return { token, link };
}

// Resolves a token to its buyer, or null. Unknown, expired and revoked all look the same.
export function buyerForToken(token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return Promise.resolve(null);
  return findBuyerByTokenHash(hashToken(token));
}
