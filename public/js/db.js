// db.js: a tiny wrapper around IndexedDB with simple async functions.
// All study data lives here, in the student's own browser. Nothing goes to a server.

const DB_NAME = 'learnpath';
const DB_VERSION = 1;

// Object stores: name -> key path + indexes (see API.md for the fields).
const SCHEMA = {
  paths: { keyPath: 'id', indexes: [] },
  topics: { keyPath: 'id', indexes: ['pathId'] },
  materials: { keyPath: 'id', indexes: ['topicId', 'pathId'] },
  page_progress: { keyPath: 'id', indexes: ['materialId'] },
  pomodoro_sessions: { keyPath: 'id', indexes: ['topicId', 'startedAt'] },
  focus_blocks: { keyPath: 'id', indexes: ['date'] },
  quiz_attempts: { keyPath: 'id', indexes: ['topicId'] },
  ai_cache: { keyPath: 'key', indexes: [] },
  settings: { keyPath: 'key', indexes: [] },
};

export const STORE_NAMES = Object.keys(SCHEMA);

let dbPromise = null;

// Open (and create/upgrade) the database once, then reuse the connection.
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, def] of Object.entries(SCHEMA)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          def.indexes.forEach((idx) => store.createIndex(idx, idx));
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database is blocked by another open tab.'));
  });
  return dbPromise;
}

// Turn an IDBRequest into a promise.
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function getAllByIndex(name, index, value) {
  return done((await store(name)).index(index).getAll(value));
}

export async function put(name, value) {
  await done((await store(name, 'readwrite')).put(value));
  return value;
}

// Save many records in ONE transaction (all or nothing).
export async function putMany(name, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    values.forEach((v) => s.put(v));
    tx.oncomplete = () => resolve(values);
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(name, key) {
  return done((await store(name, 'readwrite')).delete(key));
}

// Delete every record whose index matches a value (e.g. all topics of a path).
export async function delByIndex(name, index, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const req = tx.objectStore(name).index(index).openCursor(IDBKeyRange.only(value));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clear(name) {
  return done((await store(name, 'readwrite')).clear());
}

export async function clearAll() {
  for (const name of STORE_NAMES) await clear(name);
}

// A unique id for new records.
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// How much browser storage this site uses (bytes), if the browser can tell us.
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota };
}
