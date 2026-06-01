import { Injectable } from '@angular/core';
import { DocData } from '../../services/docs.service';

const DRAFTS_KEY = 'fn_editor:drafts';
const NEW_FUNCTIONS_KEY = 'fn_editor:new';
const TAG_DRAFTS_KEY = 'fn_editor:tags';

export interface NewFunctionMeta {
  tags: string[];
}

@Injectable()
export class EditorStorageService {
  loadDrafts(): Record<string, DocData> {
    return this.read<Record<string, DocData>>(DRAFTS_KEY) ?? {};
  }

  saveDrafts(drafts: Record<string, DocData>): void {
    this.write(DRAFTS_KEY, drafts);
  }

  loadNewFunctions(): Record<string, NewFunctionMeta> {
    return this.read<Record<string, NewFunctionMeta>>(NEW_FUNCTIONS_KEY) ?? {};
  }

  saveNewFunctions(meta: Record<string, NewFunctionMeta>): void {
    this.write(NEW_FUNCTIONS_KEY, meta);
  }

  loadTagDrafts(): Record<string, string[]> {
    return this.read<Record<string, string[]>>(TAG_DRAFTS_KEY) ?? {};
  }

  saveTagDrafts(drafts: Record<string, string[]>): void {
    this.write(TAG_DRAFTS_KEY, drafts);
  }

  private read<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as T) : null;
    } catch (err) {
      console.warn(`[EditorStorage] failed to load ${key}:`, err);
      return null;
    }
  }

  private write(key: string, value: Record<string, unknown>): void {
    try {
      if (Object.keys(value).length === 0) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[EditorStorage] failed to save ${key}:`, err);
    }
  }
}
