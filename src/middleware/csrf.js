// Double-check that state-changing requests come from our own pages: every
// form carries a hidden _csrf field and JSON/PWA calls send X-CSRF-Token.
import crypto from 'node:crypto';
import { HttpError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function tokensMatch(sent, expected) {
  if (typeof sent !== 'string' || typeof expected !== 'string' || sent.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export function verifyCsrf(req, res, next) {
  const sent = req.body?._csrf ?? req.get('x-csrf-token');
  if (tokensMatch(sent, req.session?.csrfToken)) return next();
  next(new HttpError(403, 'Invalid or missing CSRF token'));
}

// Global middleware. Multipart bodies are not parsed yet at this point, so those
// routes run verifyCsrf themselves after multer (see the gotcha in the spec).
export function csrf(req, res, next) {
  res.locals.csrfToken = csrfToken(req);
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.is('multipart/form-data')) return next();
  verifyCsrf(req, res, next);
}
