// Save slot in the browser: IndexedDB (a save is several MB, too big for localStorage).
const DB = "football-dynasty";
const STORE = "saves";
const KEY = "dynasty";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveText(text: string): Promise<void> {
  await run("readwrite", (s) => s.put(text, KEY));
}

export async function loadText(): Promise<string | null> {
  const v = await run<unknown>("readonly", (s) => s.get(KEY));
  return typeof v === "string" ? v : null;
}

export async function clearSave(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
}
