import type { ContentBundle } from '@mistvale/shared';

/**
 * IndexedDB cache for the content bundle.
 *
 * The bundle is the largest thing the client downloads and only changes when content is
 * published, so caching it across sessions removes that cost from every visit after the
 * first. IndexedDB rather than localStorage because the bundle will comfortably outgrow
 * the 5 MB string limit as content lands.
 *
 * A cache miss is never fatal: every failure path falls back to fetching.
 */

const DB_NAME = 'mistvale';
const DB_VERSION = 1;
const STORE = 'content';
const RECORD_KEY = 'bundle';

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private browsing modes can refuse outright.
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function readCachedBundle(): Promise<ContentBundle | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_KEY);
      request.onsuccess = () => {
        const value = request.result as ContentBundle | undefined;
        resolve(value && typeof value.rev === 'number' ? value : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function writeCachedBundle(bundle: ContentBundle): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(bundle, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      db.close();
    }
  });
}

/** Clears the cache; used when a bundle fails to parse. */
export async function clearCachedBundle(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(RECORD_KEY);
  } catch {
    // Nothing to do — the next fetch overwrites it anyway.
  } finally {
    db.close();
  }
}
