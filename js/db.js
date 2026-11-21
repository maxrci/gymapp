// Minimaler IndexedDB-Wrapper

const DB_NAME = 'gymlog';
const DB_VERSION = 1;
const STORES = [
  ['workouts', 'id'],
  ['routines', 'id'],
  ['exercises', 'name'],
  ['kv', 'key'],
];

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, keyPath] of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, item) => run(store, 'readwrite', (s) => s.put(item));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export const putMany = (store, items) =>
  run(store, 'readwrite', (s) => { for (const it of items) s.put(it); });
export const delMany = (store, keys) =>
  run(store, 'readwrite', (s) => { for (const k of keys) s.delete(k); });

export async function kvGet(key) {
  const r = await run('kv', 'readonly', (s) => s.get(key));
  return r ? r.value : undefined;
}
export const kvSet = (key, value) => put('kv', { key, value });
export const kvDel = (key) => del('kv', key);
