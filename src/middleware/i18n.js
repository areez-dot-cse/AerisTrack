// Translations. `t(key, values)` looks in the active language, then English,
// then returns the key itself so a missing string is visible, never blank.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { today } from '../services/clock.js';
import { formatDate, formatDateTime, formatQty, percent } from '../lib/format.js';
import { headlineExplanation, stageExplanation } from '../services/explain.js';
import { confidenceBand } from '../services/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'locales');

export const locales = {
  en: JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8')),
  ta: JSON.parse(fs.readFileSync(path.join(localesDir, 'ta.json'), 'utf8')),
};

function lookup(tree, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), tree);
}

export function translate(lang, key, values = {}) {
  const text = lookup(locales[lang], key) ?? lookup(locales.en, key);
  if (typeof text !== 'string') return Array.isArray(text) ? text : key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (values[name] ?? match));
}

export function makeT(lang) {
  return (key, values) => translate(lang, key, values);
}

function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Picks the language (user setting, then cookie, then English) and exposes
// t() plus the date/number formatters to every view.
export function i18n(req, res, next) {
  const cookieLang = readCookie(req, 'lang');
  const lang = req.user?.language ?? (cookieLang === 'ta' ? 'ta' : 'en');
  req.lang = lang;
  attachHelpers(res, lang);
  next();
}

export function attachHelpers(res, lang) {
  const t = makeT(lang);
  const todayStr = today();
  const months = translate(lang, 'months');
  res.locals.lang = lang;
  res.locals.t = t;
  res.locals.today = todayStr;
  res.locals.fmtDate = (d) => formatDate(d, { today: todayStr, months });
  res.locals.fmtDateTime = (d) => formatDateTime(d, { today: todayStr, months });
  res.locals.fmtQty = formatQty;
  res.locals.pct = percent;
  res.locals.confidenceBand = confidenceBand;
  const helpers = { t, fmtDate: res.locals.fmtDate, fmtQty: formatQty };
  // One-line maths for an order's headline, or for one stage (detailed on the order page).
  res.locals.explain = (headline, opts = {}) => headlineExplanation(headline, { ...helpers, ...opts });
  res.locals.explainStage = (stage, opts = {}) => stageExplanation(stage.projection, {
    ...helpers, unitWord: t(`common.${stage.capacity_unit ?? 'machines'}`), totalMachines: stage.total_machines ?? null, ...opts,
  });
}

export const LANG_COOKIE = 'lang';
