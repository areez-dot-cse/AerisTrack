// One-shot messages shown on the next page (e.g. "Order created.").
export function flash(req, res, next) {
  res.locals.flash = req.session?.flash ?? null;
  if (req.session?.flash) delete req.session.flash;
  req.flash = (type, message) => { req.session.flash = { type, message }; };
  next();
}
