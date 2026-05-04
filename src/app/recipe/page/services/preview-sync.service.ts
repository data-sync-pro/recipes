import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { PreviewService } from '../../core/services/preview.service';
import { LoggerService } from '../../core/services/logger.service';
import { Recipe, RecipePreviewData, normalizeCategory } from '../../core/models/recipe.model';

export interface PreviewUpdateEvent {
  type: 'content-updated';
  recipe: Recipe;
  previewData: RecipePreviewData;
}

@Injectable({
  providedIn: 'root'
})
export class PreviewSyncService {

  private updateEvent$ = new Subject<PreviewUpdateEvent>();
  private storageEventListener?: (event: StorageEvent) => void;
  private updateInterval?: number;
  private currentRecipeId?: string;
  private currentTimestamp: number = 0;

  constructor(
    private previewService: PreviewService,
    private logger: LoggerService
  ) {}

  getUpdateEvents(): Observable<PreviewUpdateEvent> {
    return this.updateEvent$.asObservable();
  }

  setupPreviewSync(recipeId: string): void {
    this.cleanup();

    this.currentRecipeId = recipeId;

    this.setupStorageListener(recipeId);

    this.setupPeriodicPolling(recipeId);
  }

  private setupStorageListener(recipeId: string): void {
    if (typeof window === 'undefined') return;

    this.storageEventListener = (event: StorageEvent) => {
      const sessionKey = `recipe-preview-${recipeId}`;
      const backupKey = `backup-recipe-preview-${recipeId}`;

      if ((event.key === sessionKey || event.key === backupKey) && event.newValue) {
        try {
          const previewData = JSON.parse(event.newValue) as RecipePreviewData;
          this.handlePreviewUpdate(previewData);
        } catch (error) {
          this.logger.error('Error parsing recipe preview update data', error);
        }
      }
    };

    window.addEventListener('storage', this.storageEventListener);
  }

  private setupPeriodicPolling(recipeId: string): void {
    if (typeof window === 'undefined') return;

    this.updateInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.checkForPreviewUpdates(recipeId);
      }
    }, 3000);
  }

  private handlePreviewUpdate(previewData: RecipePreviewData): void {
    const recipe = this.convertPreviewToRecipeItem(previewData);

    this.currentTimestamp = previewData.timestamp;

    if (typeof document !== 'undefined') {
      document.title = `[Preview] ${previewData.title} - Data Sync Pro Recipes`;
    }

    this.updateEvent$.next({
      type: 'content-updated',
      recipe,
      previewData
    });
  }

  private checkForPreviewUpdates(recipeId: string): void {
    const currentData = this.previewService.getPreviewData(recipeId);
    if (!currentData) return;

    if (currentData.timestamp > this.currentTimestamp) {
      this.handlePreviewUpdate(currentData);
    }
  }

  convertPreviewToRecipeItem(previewData: RecipePreviewData): Recipe {
    const sourceRecipe = previewData.recipeData;

    return {
      id: sourceRecipe.id,
      title: sourceRecipe.title,
      category: normalizeCategory(sourceRecipe.category),
      DSPVersions: sourceRecipe.DSPVersions,
      overview: sourceRecipe.overview,
      generalUseCase: sourceRecipe.generalUseCase,
      generalImages: sourceRecipe.generalImages,
      prerequisites: sourceRecipe.prerequisites,
      pipeline: sourceRecipe.pipeline,
      direction: sourceRecipe.direction,
      connection: sourceRecipe.connection,
      walkthrough: sourceRecipe.walkthrough,
      verificationGIF: sourceRecipe.verificationGIF,
      downloadableExecutables: sourceRecipe.downloadableExecutables,
      relatedRecipes: sourceRecipe.relatedRecipes,
      keywords: sourceRecipe.keywords
    };
  }

  setCurrentTimestamp(timestamp: number): void {
    this.currentTimestamp = timestamp;
  }

  cleanup(): void {
    if (this.storageEventListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageEventListener);
      this.storageEventListener = undefined;
    }

    if (this.updateInterval !== undefined) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    this.currentRecipeId = undefined;
    this.currentTimestamp = 0;
  }
}
