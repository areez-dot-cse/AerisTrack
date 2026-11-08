// A small error type that carries an HTTP status, so route code can `throw`
// and let the error handler pick the right page or JSON reply.
export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (message = 'Not found') => new HttpError(404, message);
