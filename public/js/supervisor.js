// The supervisor app: one cached page, two views switched by the URL hash.
//   #/            Today: every open stage on my floor
//   #/update/:id  Update: pieces, machines, photo, note, Send
// Updates are queued in IndexedDB (outbox.js) and sent whenever the network allows.
import { loadLocales, setLanguage, getLanguage, t, formatDate, formatQty } from './i18n.js';
import { queueEntry, listOutbox, removeItem, getItem, flushOutbox, cache } from './outbox.js';
import { compressPhoto } from './photo.js';
import { startRecording, isRecordingSupported, MAX_SECONDS } from './recorder.js';

const app = document.getElementById('app');
const state = {
  me: null, today: null, stages: [], outbox: [],
  online: navigator.onLine, needLogin: false, loadError: false, loading: true,
};
let top = null;
let screen = null;

// ---------- tiny DOM helper ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let toastTimer = null;
function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind === 'ok' ? 'toast-ok' : ''}`, role: 'status', text: message });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

// ---------- data ----------
async function loadMe() {
  try {
    const res = await fetch('/api/s/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) {
      state.needLogin = true;
      state.me = await cache.get('me');
      return;
    }
    state.me = await res.json();
    state.needLogin = false;
    await cache.set('me', state.me);
    // The app opens in English unless this supervisor has switched it to Tamil before.
    if (!localStorage.getItem('lang')) setLanguage(state.me.user.language ?? 'en');
  } catch {
    state.me = await cache.get('me');
  }
}

async function loadToday() {
  try {
    const res = await fetch('/api/s/today', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 401) throw Object.assign(new Error('login'), { needLogin: true });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.today = data.today;
    state.stages = data.stages;
    state.loadError = false;
    await cache.set('today', data);
  } catch (error) {
    if (error.needLogin) state.needLogin = true;
    const cached = await cache.get('today');
    if (cached) {
      state.today = cached.today;
      state.stages = cached.stages;
      state.loadError = false;
    } else {
      state.loadError = true;
    }
  }
  state.loading = false;
}

// Sends what is waiting, then refreshes the list if anything went through.
async function sync() {
  state.outbox = await listOutbox();
  if (state.online && state.me?.csrfToken && !state.needLogin) {
    let result = await flushOutbox({ csrfToken: state.me.csrfToken });
    if (result.csrfExpired) {
      await loadMe();
      if (state.me?.csrfToken && !state.needLogin) result = await flushOutbox({ csrfToken: state.me.csrfToken });
    }
    if (result.needLogin) state.needLogin = true;
    if (result.sent > 0) {
      toast(t('sup.sent'), 'ok');
      await loadToday();
    }
    state.outbox = await listOutbox();
  }
  renderTop();
  if (currentRoute().view === 'today') renderScreen();
}

// ---------- layout ----------
function currentRoute() {
  const match = (location.hash || '#/').match(/^#\/update\/(\d+)(?:\?fix=([\w-]+))?$/);
  return match ? { view: 'update', stageId: Number(match[1]), fix: match[2] ?? null } : { view: 'today' };
}

function header() {
  const route = currentRoute();
  const floor = state.me?.floor;
  const title = floor ? `${floor.unitName} · ${floor.name}` : t('app.company');
  const left = route.view === 'update'
    ? h('a', { class: 'back-link', href: '#/' }, `‹ ${t('sup.today')}`)
    : h('div', {}, h('div', { class: 'title', text: title }), h('div', { class: 'who', text: state.me?.user?.name ?? '' }));
  const langButton = h('button', { type: 'button', onclick: toggleLanguage, 'aria-label': t('sup.language') }, getLanguage() === 'ta' ? 'English' : 'தமிழ்');
  const logout = h('form', { method: 'post', action: '/logout' },
    h('input', { type: 'hidden', name: '_csrf', value: state.me?.csrfToken ?? '' }),
    h('button', { type: 'submit', text: t('sup.logout') }));
  return h('header', { class: 'sup-header' }, left, h('div', { class: 'actions' }, langButton, logout));
}

function strips() {
  const items = [];
  if (!state.online) items.push(h('div', { class: 'banner-offline', role: 'status', text: t('sup.offline') }));
  if (state.needLogin) {
    items.push(h('div', { class: 'strip strip-err' }, h('span', { text: t('sup.loginAgain') }),
      h('a', { class: 'btn', href: '/login?tab=supervisor', text: t('sup.loginButton') })));
  }
  const pending = state.outbox.filter((i) => i.status === 'pending');
  const failed = state.outbox.filter((i) => i.status === 'failed');
  if (pending.length > 0) {
    items.push(h('div', { class: 'strip strip-wait', role: 'status' },
      h('span', { text: t('sup.outboxWaiting', { count: pending.length }) }),
      state.online && h('button', { type: 'button', onclick: sync, text: t('sup.retryNow') })));
  } else if (!state.needLogin) {
    items.push(h('div', { class: 'strip strip-ok', role: 'status', text: t('sup.outboxAllSent') }));
  }
  if (failed.length > 0) {
    items.push(h('div', { class: 'outbox-list' }, failed.map((item) => h('div', { class: 'outbox-item' },
      h('div', {}, h('strong', { text: `${item.po} · ${item.stageName}` }), ` — ${t('sup.tapToFix')}`),
      h('div', { text: t('sup.failedItem', { reason: item.error ?? '' }) }),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/update/${item.stageId}?fix=${item.client_uuid}`, text: t('sup.fix') }),
        h('button', { class: 'btn', type: 'button', text: t('sup.discard'), onclick: async () => { await removeItem(item.client_uuid); await sync(); } }))))));
  }
  return items;
}

function renderTop() {
  top.replaceChildren(header(), ...strips());
}

function renderScreen() {
  const route = currentRoute();
  screen.replaceChildren(route.view === 'update' ? updateView(route) : todayView());
}

async function toggleLanguage() {
  const next = getLanguage() === 'ta' ? 'en' : 'ta';
  setLanguage(next);
  localStorage.setItem('lang', next);
  renderTop();
  renderScreen();
  if (state.me?.csrfToken && state.online) {
    fetch('/language', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: state.me.csrfToken, lang: next }),
    }).catch(() => {});
  }
}

// ---------- Today ----------
function todayView() {
  const main = h('main', { class: 'screen' });
  if (state.loading) {
    main.append(h('div', { class: 'loading-screen', 'aria-busy': 'true' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })));
    return main;
  }
  if (state.loadError) {
    main.append(h('div', { class: 'empty' }, h('p', { text: t('sup.loadFailed') }),
      h('p', {}, h('button', { class: 'btn', type: 'button', text: t('sup.retry'), onclick: async () => { state.loading = true; renderScreen(); await loadToday(); renderScreen(); } }))));
    return main;
  }
  if (state.stages.length === 0) {
    main.append(h('div', { class: 'empty', text: t('sup.noStages') }));
    return main;
  }
  const unitWord = t(`common.${state.me?.floor?.capacityUnit ?? 'machines'}`);
  for (const s of state.stages) {
    const queued = state.outbox.some((i) => i.stageId === s.id && i.status === 'pending');
    const meta = [];
    if (s.plannedStart > state.today) meta.push(h('span', { text: t('sup.startsOn', { date: formatDate(s.plannedStart, state.today) }) }));
    else meta.push(h('span', { text: t('sup.dueBy', { date: formatDate(s.plannedEnd, state.today) }) }));
    if (queued) meta.push(h('span', { class: 'done-today', text: t('sup.queuedNote') }));
    else if (s.todayEntry) meta.push(h('span', { class: 'done-today', text: `${t('sup.today')}: ${formatQty(s.todayEntry.pieces)} ${t('common.pcs')} · ${s.todayEntry.machines} ${unitWord}` }));
    else if (s.lastEntry) meta.push(h('span', { text: t('sup.lastUpdate', { date: formatDate(s.lastEntry.date, state.today), pieces: formatQty(s.lastEntry.pieces) }) }));
    else meta.push(h('span', { text: t('sup.noUpdateYet') }));
    main.append(h('a', { class: 'stage-card', href: `#/update/${s.id}` },
      h('div', { class: 'top' }, h('span', { class: 'po', text: s.po }), h('span', { class: 'stage', text: s.stage })),
      h('div', { class: 'style', text: s.style }),
      h('div', { class: 'nums' }, h('span', { text: t('sup.doneOf', { done: formatQty(s.done), target: formatQty(s.target) }) }), h('span', { text: t('sup.remainingLabel', { remaining: formatQty(s.remaining) }) })),
      h('progress', { value: s.done, max: s.target }),
      h('div', { class: 'meta' }, ...meta)));
  }
  return main;
}

// ---------- Update ----------
function updateView(route) {
  const stage = state.stages.find((s) => s.id === route.stageId);
  const main = h('main', { class: 'screen' });
  if (!stage) {
    main.append(h('div', { class: 'empty' }, h('p', { text: t('sup.loadFailed') }), h('a', { class: 'btn', href: '#/', text: t('sup.today') })));
    return main;
  }
  const floor = state.me?.floor ?? { totalMachines: 0, capacityUnit: 'machines' };
  const unitWord = t(`common.${floor.capacityUnit}`);
  const form = { photoBlob: null, audioBlob: null, recorder: null };

  const pieces = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '1', id: 'pieces', autocomplete: 'off' });
  const machines = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: String(floor.totalMachines), step: '1', id: 'machines', value: String(stage.todayEntry?.machines ?? stage.lastMachines ?? floor.totalMachines) });
  const closedDays = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '30', step: '1', id: 'closedDays' });
  const noteText = h('textarea', { id: 'noteText', maxlength: '2000', placeholder: t('sup.notePlaceholder') });
  const errorBoxes = { pieces: h('div', { class: 'error' }), machines: h('div', { class: 'error' }) };
  const closedField = h('div', { class: 'field', hidden: true },
    h('label', { for: 'closedDays', text: t('sup.closedDays') }), closedDays);
  const syncClosed = () => { closedField.hidden = Number(machines.value) !== 0; };
  machines.addEventListener('input', syncClosed);

  // Photo
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': t('sup.takePhoto') });
  const photoPreview = h('img', { class: 'photo-preview', alt: '', hidden: true });
  const removePhoto = h('button', { class: 'btn btn-danger', type: 'button', text: t('sup.removePhoto'), hidden: true });
  const photoButtonLabel = h('span', { text: t('sup.takePhoto') });
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    form.photoBlob = await compressPhoto(file);
    showPhoto();
  });
  function showPhoto() {
    if (photoPreview.src) URL.revokeObjectURL(photoPreview.src);
    photoPreview.src = URL.createObjectURL(form.photoBlob);
    photoPreview.hidden = false;
    removePhoto.hidden = false;
    photoButtonLabel.textContent = t('sup.retakePhoto');
  }
  removePhoto.addEventListener('click', () => {
    form.photoBlob = null; photoInput.value = ''; photoPreview.hidden = true; removePhoto.hidden = true; photoButtonLabel.textContent = t('sup.takePhoto');
  });

  // Voice note
  const recordButton = h('button', { class: 'btn btn-rec', type: 'button', text: t('sup.record') });
  const recTimer = h('div', { class: 'rec-timer', hidden: true });
  const audioPlayer = h('audio', { controls: true, hidden: true });
  const deleteAudio = h('button', { class: 'btn btn-danger', type: 'button', text: t('sup.deleteRecording'), hidden: true });
  function showAudio() {
    if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);
    audioPlayer.src = URL.createObjectURL(form.audioBlob);
    audioPlayer.hidden = false; deleteAudio.hidden = false; recordButton.hidden = true;
  }
  recordButton.addEventListener('click', async () => {
    if (form.recorder) { form.recorder.stop(); return; }
    try {
      form.recorder = await startRecording({
        onTick: (seconds) => { recTimer.textContent = t('sup.recording', { seconds: `${seconds}/${MAX_SECONDS}` }); },
        onDone: (blob) => { form.recorder = null; form.audioBlob = blob; recTimer.hidden = true; recordButton.textContent = t('sup.record'); showAudio(); },
      });
      recTimer.hidden = false; recTimer.textContent = t('sup.recording', { seconds: `0/${MAX_SECONDS}` });
      recordButton.textContent = t('sup.stop');
    } catch {
      toast(t('sup.loadFailed'));
    }
  });
  deleteAudio.addEventListener('click', () => { form.audioBlob = null; audioPlayer.hidden = true; deleteAudio.hidden = true; recordButton.hidden = false; });

  // Prefill when fixing a failed item.
  if (route.fix) {
    getItem(route.fix).then((item) => {
      if (!item) return;
      pieces.value = item.pieces; machines.value = item.machines; closedDays.value = item.closedDays ?? ''; noteText.value = item.noteText ?? '';
      if (item.photoBlob) { form.photoBlob = item.photoBlob; showPhoto(); }
      if (item.audioBlob) { form.audioBlob = item.audioBlob; showAudio(); }
      syncClosed();
    });
  }

  const sendButton = h('button', { class: 'btn btn-primary', type: 'submit', text: t('sup.send') });

  function validate() {
    const values = { pieces: pieces.value.trim(), machines: machines.value.trim() };
    const errors = {};
    const isInt = (v) => /^\d+$/.test(v);
    if (!isInt(values.pieces)) errors.pieces = t('sup.invalidNumber');
    if (!isInt(values.machines)) errors.machines = t('sup.invalidNumber');
    const p = Number(values.pieces); const m = Number(values.machines);
    const remaining = stage.remaining + (stage.todayEntry?.pieces ?? 0);
    if (!errors.pieces && p > remaining) errors.pieces = t('sup.piecesTooMany', { remaining: formatQty(remaining) });
    if (!errors.machines && m > floor.totalMachines) errors.machines = t('sup.machinesTooMany', { total: floor.totalMachines });
    if (!errors.pieces && !errors.machines && m === 0 && p > 0) errors.pieces = t('sup.zeroMachinesPieces');
    for (const [key, box] of Object.entries(errorBoxes)) {
      box.textContent = errors[key] ?? '';
      ({ pieces, machines })[key].setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    }
    return { ok: Object.keys(errors).length === 0, p, m };
  }

  const formEl = h('form', { novalidate: true, onsubmit: async (event) => {
    event.preventDefault();
    if (form.recorder) form.recorder.stop();
    const { ok, p, m } = validate();
    if (!ok) return;
    // Typo guard: far above the recent daily average.
    if (stage.recentAverage && p > 3 * stage.recentAverage
      && !window.confirm(t('sup.areYouSure', { pieces: formatQty(p), average: formatQty(stage.recentAverage) }))) return;
    sendButton.disabled = true; sendButton.textContent = t('sup.sending');
    const item = {
      client_uuid: uuid(), stageId: stage.id, po: stage.po, stageName: stage.stage,
      pieces: p, machines: m, closedDays: m === 0 && closedDays.value ? Number(closedDays.value) : null,
      noteText: noteText.value.trim() || null, photoBlob: form.photoBlob, audioBlob: form.audioBlob,
    };
    if (route.fix) await removeItem(route.fix);
    await queueEntry(item);
    location.hash = '#/';
    await sync();
    const stillQueued = (await listOutbox()).some((i) => i.client_uuid === item.client_uuid && i.status === 'pending');
    if (stillQueued) toast(t('sup.saved'));
  } },
    h('div', { class: 'update-head' },
      h('div', { class: 'po', text: `${stage.po} · ${stage.stage}` }),
      h('div', { class: 'sub', text: stage.style }),
      h('div', { class: 'sub', text: `${t('sup.remainingLabel', { remaining: formatQty(stage.remaining) })} · ${t('sup.dueBy', { date: formatDate(stage.plannedEnd, state.today) })}` })),
    h('div', { class: 'field' }, h('label', { for: 'pieces', text: t('sup.piecesToday') }), pieces, errorBoxes.pieces),
    h('div', { class: 'field' },
      h('label', { for: 'machines', text: floor.capacityUnit === 'tables' ? t('sup.tablesToday') : t('sup.machinesToday') }),
      h('div', { class: 'with-suffix' }, machines, h('span', { class: 'suffix', text: t('sup.ofTotal', { total: floor.totalMachines }) })),
      errorBoxes.machines),
    closedField,
    h('div', { class: 'field' }, h('label', { text: t('sup.photo') }),
      h('label', { class: 'btn file-btn' }, photoButtonLabel, photoInput), photoPreview, removePhoto),
    h('div', { class: 'field' }, h('label', { for: 'noteText', text: t('sup.note') }), noteText,
      isRecordingSupported() && h('div', { class: 'btn-row rec-row' }, recordButton), recTimer, audioPlayer, deleteAudio),
    sendButton);
  main.append(formEl);
  setTimeout(() => pieces.focus(), 50);
  return main;
}

// ---------- boot ----------
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/s/' }).catch(() => {});
  await loadLocales();
  setLanguage(localStorage.getItem('lang') ?? 'en');
  top = h('div');
  screen = h('div', { class: 'screen-wrap' });
  app.replaceChildren(top, screen);
  renderTop();
  renderScreen();
  window.addEventListener('hashchange', () => { renderTop(); renderScreen(); });
  window.addEventListener('online', () => { state.online = true; sync(); });
  window.addEventListener('offline', () => { state.online = false; renderTop(); });
  await loadMe();
  state.outbox = await listOutbox();
  renderTop();
  await loadToday();
  renderScreen();
  await sync();
}

init();
