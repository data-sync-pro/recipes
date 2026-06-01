import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

interface StorageData<T> {
  value: T;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {

  constructor(private logger: LoggerService) {}

  private isAvailable(): boolean {
    return typeof localStorage !== 'undefined';
  }

  setItem<T>(key: string, value: T): boolean {
    if (!this.isAvailable()) {
      this.logger.warn('localStorage not available');
      return false;
    }

    try {
      const data: StorageData<T> = {
        value,
        timestamp: Date.now()
      };

      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      this.logger.error(`Error storing item with key "${key}":`, error);
      return false;
    }
  }

  getItem<T>(key: string, defaultValue?: T): T | null {
    if (!this.isAvailable()) {
      return defaultValue ?? null;
    }

    try {
      const stored = localStorage.getItem(key);

      if (!stored) {
        return defaultValue ?? null;
      }

      const data: StorageData<T> = JSON.parse(stored);
      return data.value;
    } catch (error) {
      this.logger.error(`Error retrieving item with key "${key}":`, error);
      return defaultValue ?? null;
    }
  }

}
