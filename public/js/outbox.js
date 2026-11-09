// Offline queue in IndexedDB. Each update is stored as one item and sent as one
// multipart POST. 200 removes it, 4xx marks it failed for the supervisor to fix,
// 5xx or no network keeps it for the next flush.
const DB_NAME = 'tna-supervisor';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'client_uuid' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(storeName, mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

export const cache = {
  get: (key) => run('cache', 'readonly', (store) => store.get(key)).then((row) => row?.value ?? null),
  set: (key, value) => run('cache', 'readwrite', (store) => store.put({ key, value })),
};

export function queueEntry(item) {
  return run('outbox', 'readwrite', (store) => store.put({ ...item, status: 'pending', createdAt: Date.now() }));
}

export function updateItem(item) {
  return run('outbox', 'readwrite', (store) => store.put(item));
}

export function removeItem(clientUuid) {
  return run('outbox', 'readwrite', (store) => store.delete(clientUuid));
}

export function getItem(clientUuid) {
  return run('outbox', 'readonly', (store) => store.get(clientUuid));
}

export async function listOutbox() {
  const items = await run('outbox', 'readonly', (store) => store.getAll());
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

function toFormData(item) {
  const form = new FormData();
  form.append('clientUuid', item.client_uuid);
  form.append('stageId', String(item.stageId));
  form.append('pieces', String(item.pieces));
  form.append('machines', String(item.machines));
  if (item.closedDays) form.append('closedDays', String(item.closedDays));
  if (item.noteText) form.append('noteText', item.noteText);
  if (item.photoBlob) form.append('photo', item.photoBlob, 'photo.jpg');
  if (item.audioBlob) form.append('audio', item.audioBlob, 'note.webm');
  return form;
}

// Sends pending items one by one. Stops at the first network/server failure or
// expired session so the order of updates is preserved.
export async function flushOutbox({ csrfToken }) {
  const summary = { sent: 0, failed: 0, kept: 0, needLogin: false, csrfExpired: false };
  if (!navigator.onLine || !csrfToken) return summary;
  const items = (await listOutbox()).filter((item) => item.status === 'pending');
  for (const item of items) {
    let response;
    try {
      response = await fetch('/api/s/entries', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken, Accept: 'application/json' },
        body: toFormData(item),
        credentials: 'same-origin',
      });
    } catch {
      summary.kept += 1;
      break; // no network: keep everything and try later
    }
    if (response.ok) {
      await removeItem(item.client_uuid);
      summary.sent += 1;
    } else if (response.status === 401) {
      summary.needLogin = true;
      break;
    } else if (response.status === 403) {
      summary.csrfExpired = true;
      break;
    } else if (response.status >= 400 && response.status < 500) {
      let reason = `HTTP ${response.status}`;
      try { reason = (await response.json()).error ?? reason; } catch { /* keep the status */ }
      await updateItem({ ...item, status: 'failed', error: reason });
      summary.failed += 1;
    } else {
      summary.kept += 1;
      break; // server trouble: retry later
    }
  }
  return summary;
}
