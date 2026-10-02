// Saves in the browser: IndexedDB (a save is a few MB, too big for localStorage),
// one entry per key (each save slot, its offseason checkpoint, and the slot list).
const DB = "football-dynasty";
const STORE = "saves";
/** Where the one save lived before save slots. */
export const LEGACY_KEY = "dynasty";

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

export async function saveText(key: string, text: string): Promise<void> {
  await run("readwrite", (s) => s.put(text, key));
}

export async function loadText(key: string): Promise<string | null> {
  const v = await run<unknown>("readonly", (s) => s.get(key));
  return typeof v === "string" ? v : null;
}

export async function removeText(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}

