import { Injectable } from '@angular/core';
import { RecipePreviewData } from '../models/recipe.model';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class PreviewService {
  private readonly PREVIEW_KEY_PREFIX = 'recipe-preview-';

  constructor(
    private logger: LoggerService
  ) {}

  private savePreviewData(data: RecipePreviewData): void {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${data.recipeId}`;

    const processedData: RecipePreviewData = {
      ...data,
      timestamp: Date.now()
    };

    sessionStorage.setItem(storageKey, JSON.stringify(processedData));
  }

  getPreviewData(recipeId: string): RecipePreviewData | null {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${recipeId}`;
    const storedData = sessionStorage.getItem(storageKey);

    if (!storedData) {
      return null;
    }

    try {
      return JSON.parse(storedData) as RecipePreviewData;
    } catch (error) {
      this.logger.error('Error parsing recipe preview data', error);
      return null;
    }
  }

  openPreviewInNewTab(recipeId: string, data: RecipePreviewData): { success: boolean; window?: Window; url?: string } {
    this.savePreviewData(data);

    const url = `/recipes?preview=true&recipeId=${recipeId}`;

    try {
      const previewWindow = window.open(url, `recipe_preview_${recipeId.replace(/[^a-zA-Z0-9]/g, '_')}`);

      if (previewWindow) {
        return { success: true, window: previewWindow };
      } else {
        return { success: false, url };
      }
    } catch (error) {
      this.logger.error('Error opening recipe preview window', error);
      return { success: false, url };
    }
  }

  updatePreviewData(data: RecipePreviewData): void {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${data.recipeId}`;

    const updatedData = {
      ...data,
      timestamp: Date.now()
    };
    const dataString = JSON.stringify(updatedData);

    this.logger.debug(`Updating recipe preview data for: ${data.recipeId}`, { timestamp: new Date().toLocaleTimeString() });

    sessionStorage.removeItem(storageKey);
    sessionStorage.setItem(storageKey, dataString);

    this.logger.debug('Recipe preview data saved to sessionStorage');

    const backupKey = `backup-${storageKey}`;
    localStorage.removeItem(backupKey);
    localStorage.setItem(backupKey, dataString);

    this.logger.debug('Recipe preview backup saved to localStorage');
  }
}