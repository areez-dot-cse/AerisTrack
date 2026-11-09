import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

function wantsJson(req) {
  return req.path.startsWith('/api/') || req.get('accept')?.includes('application/json');
}

// Last middleware: turns any error into a JSON reply (API) or an error page.
// Stack traces are logged, never shown, outside development.
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status ?? 500;
  let message = err.message;
  if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'File too large'; }
  if (err.type === 'entity.too.large') { status = 413; message = 'Request too large'; }
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status);
  if (wantsJson(req)) {
    const body = { error: status >= 500 && config.isProd ? 'Server error' : message };
    if (err.details) body.details = err.details;
    return res.json(body);
  }
  const page = status === 404 ? '404' : status === 403 ? '403' : '500';
  res.render(`errors/${page}`, {
    title: res.locals.t ? res.locals.t(`errors.${page}title`) : 'Error',
    message: status >= 500 && config.isProd ? null : message,
  });
}
