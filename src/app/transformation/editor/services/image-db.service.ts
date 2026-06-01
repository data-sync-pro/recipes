import { Injectable } from '@angular/core';

const DB_NAME = 'fn_editor';
const DB_VERSION = 1;
const STORE = 'images';

export interface StoredImage {
  id: string;        // `${docName}::${filename}`
  docName: string;
  filename: string;
  blob: Blob;
}

/**
 * Vanilla IndexedDB wrapper. Persists uploaded image bytes so they survive page refresh.
 * All methods return promises and degrade silently if IndexedDB is unavailable.
 */
@Injectable()
export class ImageDbService {
  private readonly dbReady: Promise<IDBDatabase | null>;

  constructor() {
    this.dbReady = this.openDb();
  }

  async loadAll(): Promise<StoredImage[]> {
    const db = await this.dbReady;
    if (!db) return [];
    return new Promise<StoredImage[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
      req.onerror = () => {
        console.warn('[ImageDb] loadAll failed', req.error);
        resolve([]);
      };
    });
  }

  async put(docName: string, filename: string, blob: Blob): Promise<void> {
    const db = await this.dbReady;
    if (!db) return;
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record: StoredImage = {
        id: this.makeId(docName, filename),
        docName,
        filename,
        blob,
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.warn('[ImageDb] put failed', req.error);
        resolve();
      };
    });
  }

  async delete(docName: string, filename: string): Promise<void> {
    const db = await this.dbReady;
    if (!db) return;
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.delete(this.makeId(docName, filename));
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  async deleteByDocName(docName: string): Promise<void> {
    const db = await this.dbReady;
    if (!db) return;
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const idx = store.index('byDocName');
      const req = idx.openCursor(IDBKeyRange.only(docName));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.dbReady;
    if (!db) return;
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  private makeId(docName: string, filename: string): string {
    return `${docName}::${filename}`;
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      console.warn('[ImageDb] IndexedDB not available; image persistence disabled.');
      return Promise.resolve(null);
    }
    return new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('byDocName', 'docName', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[ImageDb] open failed', req.error);
        resolve(null);
      };
    });
  }
}
