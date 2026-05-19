import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface EditedFAQ {
  id: string;
  faqId: string;
  question: string;
  answer: string;
  category: string;
  subCategory?: string;
  isActive?: boolean;
  timestamp: number;
  version: number;
}

interface EditSession {
  id: string;
  startTime: number;
  lastModified: number;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FAQStorageService {
  private readonly DB_NAME = 'FAQEditorDB';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'edited_faqs';
  private readonly SESSION_STORE = 'edit_sessions';
  private readonly HISTORY_LIMIT = 10;
  
  private db: IDBDatabase | null = null;
  private editedFAQs$ = new BehaviorSubject<Map<string, EditedFAQ>>(new Map());
  private currentSession$ = new BehaviorSubject<EditSession | null>(null);

  constructor() {
    this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    if (!('indexedDB' in window)) {
      console.error('IndexedDB is not supported in this browser');
      return;
    }

    try {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB');
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.loadEditedFAQs();
        this.startEditSession();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create edited FAQs store
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('faqId', 'faqId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('version', 'version', { unique: false });
        }

        // Create edit sessions store
        if (!db.objectStoreNames.contains(this.SESSION_STORE)) {
          const sessionStore = db.createObjectStore(this.SESSION_STORE, { keyPath: 'id' });
          sessionStore.createIndex('lastModified', 'lastModified', { unique: false });
        }
      };
    } catch (error) {
      console.error('Error initializing IndexedDB:', error);
    }
  }

  private async loadEditedFAQs(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const faqs = request.result as EditedFAQ[];
        const faqMap = new Map<string, EditedFAQ>();
        
        // Get the latest version of each FAQ
        faqs.forEach(faq => {
          const existing = faqMap.get(faq.faqId);
          if (!existing || existing.version < faq.version) {
            faqMap.set(faq.faqId, faq);
          }
        });

        this.editedFAQs$.next(faqMap);
      };
    } catch (error) {
      console.error('Error loading edited FAQs:', error);
    }
  }

  private async startEditSession(): Promise<void> {
    const session: EditSession = {
      id: `session_${Date.now()}`,
      startTime: Date.now(),
      lastModified: Date.now(),
      isActive: true
    };

    await this.saveSession(session);
    this.currentSession$.next(session);
  }

  private async saveSession(session: EditSession): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.SESSION_STORE], 'readwrite');
      const store = transaction.objectStore(this.SESSION_STORE);
      await store.put(session);
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  async saveFAQ(faq: Partial<EditedFAQ>): Promise<boolean> {
    if (!this.db) return false;

    try {
      const existingFAQ = this.editedFAQs$.value.get(faq.faqId!);
      const version = existingFAQ ? existingFAQ.version + 1 : 1;
      
      const editedFAQ: EditedFAQ = {
        id: `${faq.faqId}_v${version}_${Date.now()}`,
        faqId: faq.faqId!,
        question: faq.question!,
        answer: faq.answer!,
        category: faq.category!,
        subCategory: faq.subCategory,
        isActive: faq.isActive,
        timestamp: Date.now(),
        version: version
      };

      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      await store.add(editedFAQ);

      // Update current edited FAQs
      const updatedMap = new Map(this.editedFAQs$.value);
      updatedMap.set(editedFAQ.faqId, editedFAQ);
      this.editedFAQs$.next(updatedMap);

      // Update session
      const session = this.currentSession$.value;
      if (session) {
        session.lastModified = Date.now();
        await this.saveSession(session);
      }

      // Clean up old versions
      await this.cleanupOldVersions(faq.faqId!);

      return true;
    } catch (error) {
      console.error('Error saving FAQ:', error);
      return false;
    }
  }

  private async cleanupOldVersions(faqId: string): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('faqId');
      const request = index.getAll(faqId);

      request.onsuccess = () => {
        const versions = request.result as EditedFAQ[];
        versions.sort((a, b) => b.version - a.version);

        // Keep only the latest HISTORY_LIMIT versions
        if (versions.length > this.HISTORY_LIMIT) {
          const toDelete = versions.slice(this.HISTORY_LIMIT);
          toDelete.forEach(faq => {
            store.delete(faq.id);
          });
        }
      };
    } catch (error) {
      console.error('Error cleaning up old versions:', error);
    }
  }

  getEditedFAQ(faqId: string): EditedFAQ | undefined {
    return this.editedFAQs$.value.get(faqId);
  }

  getEditedFAQs(): Observable<Map<string, EditedFAQ>> {
    return this.editedFAQs$.asObservable();
  }

  async getVersionHistory(faqId: string): Promise<EditedFAQ[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('faqId');
      const request = index.getAll(faqId);

      request.onsuccess = () => {
        const versions = request.result as EditedFAQ[];
        versions.sort((a, b) => b.version - a.version);
        resolve(versions);
      };

      request.onerror = () => {
        resolve([]);
      };
    });
  }

  async restoreVersion(versionId: string): Promise<boolean> {
    if (!this.db) return false;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(versionId);

      return new Promise((resolve) => {
        request.onsuccess = async () => {
          const version = request.result as EditedFAQ;
          if (version) {
            // Save as new version
            await this.saveFAQ(version);
            resolve(true);
          } else {
            resolve(false);
          }
        };

        request.onerror = () => {
          resolve(false);
        };
      });
    } catch (error) {
      console.error('Error restoring version:', error);
      return false;
    }
  }

  async clearAllEdits(): Promise<boolean> {
    if (!this.db) return false;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      await store.clear();

      this.editedFAQs$.next(new Map());
      return true;
    } catch (error) {
      console.error('Error clearing edits:', error);
      return false;
    }
  }

  async exportEdits(): Promise<EditedFAQ[]> {
    const editedMap = this.editedFAQs$.value;
    return Array.from(editedMap.values());
  }

  async importEdits(faqs: EditedFAQ[]): Promise<boolean> {
    if (!this.db) return false;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      for (const faq of faqs) {
        // Adjust version to avoid conflicts
        const existingFAQ = this.editedFAQs$.value.get(faq.faqId);
        if (existingFAQ) {
          faq.version = existingFAQ.version + 1;
        }
        faq.id = `${faq.faqId}_v${faq.version}_${Date.now()}`;
        await store.add(faq);
      }

      await this.loadEditedFAQs();
      return true;
    } catch (error) {
      console.error('Error importing edits:', error);
      return false;
    }
  }

  getStorageStats(): Observable<{ used: number; available: number }> {
    return from(navigator.storage.estimate()).pipe(
      map(estimate => ({
        used: estimate.usage || 0,
        available: estimate.quota || 0
      })),
      catchError(() => of({ used: 0, available: 0 }))
    );
  }
}