// Client-side translations for the supervisor app. Loads both locale files
// once (they are precached by the service worker) and falls back to English.
// English is the default; the header toggle switches everything to Tamil.
const strings = { en: null, ta: null };
let current = 'en';

export async function loadLocales() {
  const [en, ta] = await Promise.all([
    fetch('/locales/en.json').then((r) => r.json()),
    fetch('/locales/ta.json').then((r) => r.json()),
  ]);
  strings.en = en;
  strings.ta = ta;
}

export function setLanguage(lang) {
  current = lang === 'ta' ? 'ta' : 'en';
  document.documentElement.lang = current;
}

export function getLanguage() {
  return current;
}

function lookup(tree, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), tree);
}

export function t(key, values = {}) {
  const text = lookup(strings[current], key) ?? lookup(strings.en, key);
  if (typeof text !== 'string') return Array.isArray(text) ? text : key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (values[name] ?? match));
}

export function formatDate(dateStr, today) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const text = `${day} ${t('months')[month - 1]}`;
  return year === Number(today.slice(0, 4)) ? text : `${text} ${year}`;
}

export function formatQty(n) {
  return Number(n ?? 0).toLocaleString('en-GB');
}
