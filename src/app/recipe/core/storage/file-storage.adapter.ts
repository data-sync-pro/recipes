import { Injectable } from '@angular/core';
import { LoggerService } from '../services/logger.service';
import { formatFileSize } from '../utils';
import { FILE_SIZE } from '../constants/recipe.constants';

export interface StoredImage {
  id: string;
  file: File;
  timestamp: number;
}

export interface StoredJsonFile {
  id: string;
  file: File;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class FileStorageAdapter {
  private dbName = 'RecipeEditorDB';
  private imageStoreName = 'images';
  private jsonStoreName = 'jsonFiles';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  private readonly RANDOM_STRING_LENGTH = 9;
  private readonly RANDOM_STRING_RADIX = 36;

  constructor(private logger: LoggerService) {}

  private async performDbOperation<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async init(): Promise<IDBDatabase> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);

      request.onerror = () => {
        this.logger.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;

        this.logger.debug(`Upgrading IndexedDB from version ${oldVersion} to ${newVersion}`);

        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(this.imageStoreName)) {
            const store = db.createObjectStore(this.imageStoreName, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            this.logger.debug('Created images object store');
          }
        }

        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(this.jsonStoreName)) {
            const store = db.createObjectStore(this.jsonStoreName, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            this.logger.debug('Created JSON files object store');
          }
        }
      };
    });

    return this.initPromise;
  }

  async storeImage(id: string, file: File): Promise<string> {
    const imageData: StoredImage = {
      id,
      file,
      timestamp: Date.now()
    };

    await this.performDbOperation(
      this.imageStoreName,
      'readwrite',
      (store) => store.put(imageData)
    );

    this.logger.debug(`Image stored successfully: ${id}`);
    return id;
  }

  async getImage(id: string): Promise<File | null> {
    const result = await this.performDbOperation<StoredImage>(
      this.imageStoreName,
      'readonly',
      (store) => store.get(id)
    );

    return result ? result.file : null;
  }

  async deleteImage(id: string): Promise<boolean> {
    try {
      await this.performDbOperation(
        this.imageStoreName,
        'readwrite',
        (store) => store.delete(id)
      );

      this.logger.debug(`Image deleted successfully: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete image ${id}:`, error);
      return false;
    }
  }

  async clearAll(): Promise<boolean> {
    try {
      await this.performDbOperation(
        this.imageStoreName,
        'readwrite',
        (store) => store.clear()
      );

      this.logger.debug('All images cleared successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to clear all images:', error);
      return false;
    }
  }

  generateImageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(this.RANDOM_STRING_RADIX).substring(2, 2 + this.RANDOM_STRING_LENGTH);
    return `img_${timestamp}_${random}`;
  }

  async imageExists(id: string): Promise<boolean> {
    try {
      const image = await this.getImage(id);
      return image !== null;
    } catch (error) {
      return false;
    }
  }

  isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    return validTypes.includes(file.type);
  }


  isValidFileSize(file: File): boolean {
    return file.size <= FILE_SIZE.MAX_FILE_SIZE_BYTES;
  }

  validateImageFile(file: File): { valid: boolean; error?: string } {
    if (!this.isValidImageFile(file)) {
      return { valid: false, error: 'Invalid file type. Only images are allowed.' };
    }

    if (!this.isValidFileSize(file)) {
      return { valid: false, error: `File too large. Maximum size is ${formatFileSize(FILE_SIZE.MAX_FILE_SIZE_BYTES)}.` };
    }

    return { valid: true };
  }

  async storeJsonFile(id: string, file: File): Promise<string> {
    const jsonData: StoredJsonFile = {
      id,
      file,
      timestamp: Date.now()
    };

    await this.performDbOperation(
      this.jsonStoreName,
      'readwrite',
      (store) => store.put(jsonData)
    );

    this.logger.debug(`JSON file stored successfully: ${id}`);
    return id;
  }

  async getJsonFile(id: string): Promise<File | null> {
    const result = await this.performDbOperation<StoredJsonFile>(
      this.jsonStoreName,
      'readonly',
      (store) => store.get(id)
    );

    return result ? result.file : null;
  }

  async deleteJsonFile(id: string): Promise<boolean> {
    try {
      await this.performDbOperation(
        this.jsonStoreName,
        'readwrite',
        (store) => store.delete(id)
      );

      this.logger.debug(`JSON file deleted successfully: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete JSON file ${id}:`, error);
      return false;
    }
  }

  validateJsonFile(file: File): { valid: boolean; error?: string } {
    if (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
      return { valid: false, error: 'Invalid file type. Only JSON files are allowed.' };
    }

    if (file.size > FILE_SIZE.MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: `File too large. Maximum size is ${formatFileSize(FILE_SIZE.MAX_FILE_SIZE_BYTES)}.` };
    }

    return { valid: true };
  }

  sanitizeFileName(fileName: string): string {
    if (!fileName) return 'unnamed.json';

    // Split filename and extension
    const lastDotIndex = fileName.lastIndexOf('.');
    const hasExtension = lastDotIndex > 0;
    const name = hasExtension ? fileName.substring(0, lastDotIndex) : fileName;
    const extension = hasExtension ? fileName.substring(lastDotIndex) : '';

    // Only remove characters that are invalid in filenames: / \ ? < > : * | "
    // Keep other punctuation like parentheses, brackets, etc.
    let sanitized = name
      .replace(/[/\\?<>:*|"]/g, '')  // Remove invalid filename chars
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .trim();

    // Ensure we have a valid name
    if (!sanitized) {
      sanitized = 'unnamed';
    }

    return sanitized + extension;
  }
}
