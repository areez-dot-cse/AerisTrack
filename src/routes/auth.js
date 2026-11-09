import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { findUserByEmail, findUserByPhone, updateUserLanguage } from '../db/queries/users.js';
import { officeLoginSchema, supervisorLoginSchema, languageSchema } from '../validation/schemas.js';
import { parseInput } from '../middleware/validate.js';
import { LANG_COOKIE } from '../middleware/i18n.js';
import { config } from '../config.js';

const router = Router();

// 5 attempts per 15 minutes per IP + identifier. Successful logins don't count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? req.body?.phone ?? '').toLowerCase()}`,
  handler: (req, res) => {
    const tab = req.path.includes('supervisor') ? 'supervisor' : 'office';
    res.status(429).render('office/login', { title: res.locals.t('login.title'), tab, error: res.locals.t('login.tooMany'), values: req.body });
  },
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

async function signIn(req, user, maxAge) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.cookie.maxAge = maxAge;
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'supervisor' ? '/s/' : '/board');
  const tab = req.query.tab === 'supervisor' ? 'supervisor' : 'office';
  res.render('office/login', { title: res.locals.t('login.title'), tab, error: null, values: {} });
});

router.post('/login/office', loginLimiter, async (req, res) => {
  const { data } = parseInput(officeLoginSchema, req.body);
  const user = data ? await findUserByEmail(data.email) : null;
  const ok = user && await bcrypt.compare(data.password, user.password_hash);
  if (!ok) {
    return res.status(401).render('office/login', { title: res.locals.t('login.title'), tab: 'office', error: res.locals.t('login.wrong'), values: { email: req.body.email } });
  }
  await signIn(req, user, config.session.officeMs);
  res.redirect('/board');
});

router.post('/login/supervisor', loginLimiter, async (req, res) => {
  const { data } = parseInput(supervisorLoginSchema, req.body);
  const user = data ? await findUserByPhone(data.phone) : null;
  const ok = user && await bcrypt.compare(data.pin, user.password_hash);
  if (!ok) {
    return res.status(401).render('office/login', { title: res.locals.t('login.title'), tab: 'supervisor', error: res.locals.t('login.wrongPin'), values: { phone: req.body.phone } });
  }
  await signIn(req, user, config.session.supervisorMs);
  res.redirect('/s/');
});

router.post('/logout', (req, res) => {
  const wasSupervisor = req.user?.role === 'supervisor';
  req.session.destroy(() => {
    res.clearCookie('tna.sid');
    res.set('Clear-Site-Data', '"cache"');
    res.redirect(wasSupervisor ? '/login?tab=supervisor' : '/login');
  });
});

// Language toggle: saved on the user, with a cookie fallback before login.
router.post('/language', async (req, res) => {
  const { data } = parseInput(languageSchema, req.body);
  if (data) {
    if (req.user) await updateUserLanguage(req.user.id, data.lang);
    res.cookie(LANG_COOKIE, data.lang, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax', secure: config.isProd });
  }
  const back = req.get('referer');
  res.redirect(back && back.startsWith(`${req.protocol}://${req.get('host')}/`) ? back : '/');
});

export default router;
