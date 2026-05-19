import { Injectable } from '@angular/core';
import { StorageAdapter } from './storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { IndexedDBAdapter } from './indexeddb.adapter';
import { SessionStorageAdapter } from './session-storage.adapter';
import { LoggerService } from '../services/logger.service';

enum StorageType {
  LOCAL = 'local',
  INDEXED_DB = 'indexeddb',
  SESSION = 'session'
}

@Injectable({
  providedIn: 'root'
})
export class UnifiedStorageService {
  private adapters: Map<StorageType, StorageAdapter> = new Map();
  private defaultAdapter: StorageAdapter;

  constructor(
    private localStorageAdapter: LocalStorageAdapter,
    private indexedDBAdapter: IndexedDBAdapter,
    private sessionStorageAdapter: SessionStorageAdapter,
    private logger: LoggerService
  ) {
    this.adapters.set(StorageType.LOCAL, localStorageAdapter);
    this.adapters.set(StorageType.INDEXED_DB, indexedDBAdapter);
    this.adapters.set(StorageType.SESSION, sessionStorageAdapter);

    this.defaultAdapter = this.getBestAvailableAdapter();

    this.logger.info('UnifiedStorageService initialized', {
      defaultAdapter: this.defaultAdapter.name
    });
  }

  private getBestAvailableAdapter(): StorageAdapter {
    if (this.localStorageAdapter.isAvailable()) {
      return this.localStorageAdapter;
    }
    if (this.sessionStorageAdapter.isAvailable()) {
      return this.sessionStorageAdapter;
    }
    if (this.indexedDBAdapter.isAvailable()) {
      return this.indexedDBAdapter;
    }

    return this.localStorageAdapter;
  }

  private getAdapter(type?: StorageType): StorageAdapter {
    if (!type) {
      return this.defaultAdapter;
    }

    const adapter = this.adapters.get(type);
    if (!adapter) {
      this.logger.warn(`Storage adapter not found: ${type}, using default`);
      return this.defaultAdapter;
    }

    if (!adapter.isAvailable()) {
      this.logger.warn(`Storage adapter not available: ${type}, using default`);
      return this.defaultAdapter;
    }

    return adapter;
  }

  private async getItem<T = any>(key: string, type?: StorageType): Promise<T | null> {
    const adapter = this.getAdapter(type);

    try {
      const value = await adapter.getItem<T>(key);
      this.logger.debug(`getItem: ${key}`, { adapter: adapter.name, found: value !== null });
      return value;
    } catch (error) {
      this.logger.error(`getItem failed: ${key}`, error);
      return null;
    }
  }

  private async setItem<T = any>(
    key: string,
    value: T,
    type?: StorageType,
    ttl?: number
  ): Promise<boolean> {
    const adapter = this.getAdapter(type);

    try {
      await adapter.setItem(key, value);
      this.logger.debug(`setItem: ${key}`, { adapter: adapter.name });
      return true;
    } catch (error) {
      this.logger.error(`setItem failed: ${key}`, error);

      if (type === StorageType.INDEXED_DB) {
        this.logger.info('Falling back to LocalStorage');
        return this.setItem(key, value, StorageType.LOCAL, ttl);
      }

      return false;
    }
  }

  async setLocal<T = any>(key: string, value: T): Promise<boolean> {
    return this.setItem(key, value, StorageType.LOCAL);
  }

  async getLocal<T = any>(key: string): Promise<T | null> {
    return this.getItem<T>(key, StorageType.LOCAL);
  }
}
