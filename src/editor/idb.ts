// A small IndexedDB wrapper for the Assets window: texture drafts (they hold
// Blobs, not base64 strings), local map previews of built-in textures, and the
// generated Auto maps of shared textures. localStorage is only for tiny things.

const NAME = "voidcrew-assets";
const VERSION = 4;
export type Store = "drafts" | "previews" | "auto" | "imageDrafts" | "actorDrafts" | "dialogueDrafts";

// a real storage quota failure (as opposed to any other IndexedDB error)
export class StorageFullError extends Error {
  constructor() { super("storage full"); this.name = "StorageFullError"; }
}

let opened: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["drafts", "previews", "auto", "imageDrafts", "actorDrafts", "dialogueDrafts"] as const) {
        if (db.objectStoreNames.contains(name)) continue;
        const keyPath = name === "drafts" ? "uuid" : name === "auto" ? undefined : "id";
        db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = undefined; };
      resolve(db);
    };
    request.onerror = () => { opened = undefined; reject(request.error); };
  });
  return opened;
}

function fail(error: unknown): never {
  if (error instanceof DOMException && error.name === "QuotaExceededError") throw new StorageFullError();
  throw error;
}

async function run<T>(store: Store, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>;
    let tx: IDBTransaction;
    try { tx = db.transaction(store, mode); request = work(tx.objectStore(store)); } catch (error) { reject(error); return; }
    // a write counts when the transaction commits (that is where a quota error surfaces)
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error);
    tx.onerror = () => reject(tx.error ?? request.error);
  }).catch(fail);
}

export const idb = {
  get: <T>(store: Store, key: string) => run<T | undefined>(store, "readonly", s => s.get(key)),
  all: <T>(store: Store) => run<T[]>(store, "readonly", s => s.getAll()),
  put: (store: Store, value: unknown, key?: string) => run(store, "readwrite", s => key === undefined ? s.put(value) : s.put(value, key)),
  del: (store: Store, key: string) => run(store, "readwrite", s => s.delete(key)),
};
