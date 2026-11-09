import { findUserById } from '../db/queries/users.js';
import { HttpError } from '../lib/errors.js';

// Loads the signed-in user from the session onto req.user / res.locals.user.
export async function loadUser(req, res, next) {
  req.user = null;
  if (req.session?.userId) {
    req.user = await findUserById(req.session.userId);
    if (!req.user) req.session.destroy(() => {});
  }
  res.locals.user = req.user;
  res.locals.currentPath = req.path;
  next();
}

function isApi(req) {
  return req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/');
}

// Office routes are for merchandisers, /s/ and /api/s/ for supervisors.
// No session: redirect to the right login tab (or 401 for the PWA API).
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      if (isApi(req)) return next(new HttpError(401, 'Please log in again'));
      const tab = role === 'supervisor' ? '?tab=supervisor' : '';
      return res.redirect(`/login${tab}`);
    }
    if (req.user.role !== role) return next(new HttpError(403, 'This page is for another role'));
    // Protected pages must be revalidated after logout instead of being revived
    // from the browser's history cache.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    next();
  };
}
