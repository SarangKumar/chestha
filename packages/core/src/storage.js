// A deliberately small key/value store over IndexedDB, one record per state area.
// If IndexedDB is unavailable (private window, blocked site data, enterprise
// policy) we fall back to memory and say so, rather than pretending to save.

const DB_NAME = 'chestha';
const DB_VERSION = 1;
const STORE = 'kv';

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Storage request failed.'));
  });
}

function memoryStorage(reason) {
  const map = new Map();
  return {
    mode: 'memory',
    reason,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : undefined; },
    async set(key, value) { map.set(key, structuredClone(value)); },
    async remove(key) { map.delete(key); },
    async clear() { map.clear(); },
  };
}

export async function openStorage() {
  if (typeof indexedDB === 'undefined') {
    return memoryStorage('This browser does not expose IndexedDB.');
  }
  let db;
  try {
    db = await openDatabase();
  } catch (error) {
    return memoryStorage(describeStorageError(error));
  }

  const run = (mode, work) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('The storage transaction was aborted.'));
    tx.onerror = () => reject(tx.error ?? new Error('The storage transaction failed.'));
    Promise.resolve(work(tx.objectStore(STORE)))
      .then((value) => { result = value; })
      .catch((error) => { try { tx.abort(); } catch { /* already aborting */ } reject(error); });
  });

  return {
    mode: 'idb',
    reason: null,
    get: (key) => run('readonly', (store) => requestToPromise(store.get(key))),
    set: (key, value) => run('readwrite', (store) => requestToPromise(store.put(value, key))),
    remove: (key) => run('readwrite', (store) => requestToPromise(store.delete(key))),
    clear: () => run('readwrite', (store) => requestToPromise(store.clear())),
  };
}

export function describeStorageError(error) {
  const name = error?.name ?? '';
  if (name === 'QuotaExceededError') {
    return 'The browser is out of storage space for this site. Export your data, then remove some completed tasks.';
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return 'This browser is blocking site storage, which happens in some private windows and with strict privacy settings.';
  }
  return error?.message ? `Storage is unavailable: ${error.message}` : 'Storage is unavailable in this browser window.';
}

// Browsers may evict site storage under pressure. Asking costs nothing and a
// refusal is the expected answer, not an error.
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: false };
    const already = await navigator.storage.persisted?.();
    if (already) return { supported: true, persisted: true };
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: false };
  }
}

export async function estimateUsage() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number') return null;
    return { usage, quota };
  } catch {
    return null;
  }
}
