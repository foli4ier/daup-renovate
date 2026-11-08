import type { PictureBytes, PictureRecord } from "./persist";

const DB_NAME = "daup-renovate";
const STORE = "pictures";

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("pictures"));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("pictures"));
  });
}

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("pictures"));
  if (!opening) {
    opening = openDb().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => T): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch (error) {
          opening = null;
          try {
            db.close();
          } catch {
            /* already closed */
          }
          reject(error instanceof Error ? error : new Error("pictures"));
          return;
        }
        let result: T;
        try {
          result = work(tx.objectStore(STORE));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("pictures"));
          return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("pictures"));
        tx.onabort = () => reject(tx.error ?? new Error("pictures"));
      }),
  );
}

/** IndexedDB picture bytes. Values are data URLs, keyed by the plan's picture id. */
export function pictureDb(): PictureBytes {
  return {
    put(records: PictureRecord[]) {
      if (!records.length) return Promise.resolve();
      return run("readwrite", (store) => {
        for (const record of records) store.put(record.dataUrl, record.id);
      });
    },
    get(ids: string[]) {
      if (!ids.length) return Promise.resolve(new Map<string, string>());
      return run("readonly", (store) => {
        const found = new Map<string, string>();
        for (const id of ids) {
          const request = store.get(id);
          request.onsuccess = () => {
            if (typeof request.result === "string" && request.result.startsWith("data:")) found.set(id, request.result);
          };
        }
        return found;
      });
    },
    delete(ids: string[]) {
      if (!ids.length) return Promise.resolve();
      return run("readwrite", (store) => {
        for (const id of ids) store.delete(id);
      });
    },
  };
}
