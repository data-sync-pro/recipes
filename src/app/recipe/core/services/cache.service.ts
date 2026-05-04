import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { Recipe, RecipeData } from '../models/recipe.model';
import { UnifiedStorageService, StorageType } from '../storage/unified-storage.service';
import { LoggerService } from './logger.service';
import { SafeHtml } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private readonly STORAGE_KEY_RECIPE_CONTENT = 'recipe_content_cache_v2';
  private readonly STORAGE_KEY_RECIPE_PROGRESS = 'recipe_progress_cache';
  private readonly STORAGE_KEY_POPULAR_RECIPES = 'popular_recipes_cache';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  private recipesCache$ = new BehaviorSubject<Recipe[]>([]);
  private contentCache = new Map<string, SafeHtml>();

  constructor(
    private storage: UnifiedStorageService,
    private logger: LoggerService
  ) {
    this.loadFromStorage();
  }

  getRecipes$(): Observable<Recipe[]> {
    return this.recipesCache$.asObservable().pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getRecipes(): Recipe[] {
    return this.recipesCache$.value;
  }

  setRecipes(recipes: Recipe[]): void {
    this.recipesCache$.next(recipes);
    this.saveToStorage(recipes);
    this.logger.debug('Recipes cache updated', { count: recipes.length });
  }

  addRecipe(recipe: Recipe): void {
    const currentRecipes = this.getRecipes();
    const index = currentRecipes.findIndex(r => r.id === recipe.id);

    if (index !== -1) {
      currentRecipes[index] = recipe;
    } else {
      currentRecipes.push(recipe);
    }

    this.setRecipes([...currentRecipes]);
  }

  updateRecipe(recipeId: string, updates: Partial<Recipe>): void {
    const currentRecipes = this.getRecipes();
    const index = currentRecipes.findIndex(r => r.id === recipeId);

    if (index !== -1) {
      currentRecipes[index] = { ...currentRecipes[index], ...updates };
      this.setRecipes([...currentRecipes]);
    } else {
      this.logger.warn('Attempted to update non-existent recipe', { recipeId });
    }
  }

  removeRecipe(recipeId: string): void {
    const currentRecipes = this.getRecipes();
    const filtered = currentRecipes.filter(r => r.id !== recipeId);

    if (filtered.length !== currentRecipes.length) {
      this.setRecipes(filtered);
      this.logger.debug('Recipe removed from cache', { recipeId });
    }
  }

  findRecipeById(recipeId: string): Recipe | undefined {
    return this.getRecipes().find(r => r.id === recipeId);
  }

  findRecipesByCategory(category: string): Recipe[] {
    return this.getRecipes().filter(r => r.category.includes(category));
  }

  clearMemoryCache(): void {
    this.recipesCache$.next([]);
    this.contentCache.clear();
    this.logger.info('Memory cache cleared');
  }

  getContent(key: string): SafeHtml | undefined {
    return this.contentCache.get(key);
  }

  setContent(key: string, content: SafeHtml): void {
    this.contentCache.set(key, content);
  }

  hasContent(key: string): boolean {
    return this.contentCache.has(key);
  }

  clearContentCache(): void {
    this.contentCache.clear();
    this.logger.debug('Content cache cleared');
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const cached = await this.storage.getLocal<{
        recipes: RecipeData[];
        timestamp: number;
      }>(this.STORAGE_KEY_RECIPE_CONTENT);

      if (cached && this.isCacheValid(cached.timestamp)) {
        this.logger.info('Loaded recipes from localStorage', { count: cached.recipes.length });
      } else {
        this.logger.debug('Cache expired or not found');
      }
    } catch (error) {
      this.logger.error('Failed to load from localStorage', error);
    }
  }

  private async saveToStorage(recipes: Recipe[]): Promise<void> {
    try {
      const sourceRecipes: RecipeData[] = recipes.map(item => ({
        id: item.id,
        title: item.title,
        category: item.category,
        DSPVersions: item.DSPVersions,
        overview: item.overview,
        generalUseCase: item.generalUseCase,
        generalImages: item.generalImages,
        prerequisites: item.prerequisites,
        pipeline: item.pipeline,
        direction: item.direction,
        connection: item.connection,
        walkthrough: item.walkthrough,
        verificationGIF: item.verificationGIF,
        downloadableExecutables: item.downloadableExecutables,
        relatedRecipes: item.relatedRecipes,
        keywords: item.keywords
      }));

      await this.storage.setLocal(this.STORAGE_KEY_RECIPE_CONTENT, {
        recipes: sourceRecipes,
        timestamp: Date.now()
      });

      this.logger.debug('Saved recipes to localStorage', { count: sourceRecipes.length });
    } catch (error) {
      this.logger.error('Failed to save to localStorage', error);
    }
  }

  private isCacheValid(timestamp: number): boolean {
    const now = Date.now();
    return (now - timestamp) < this.CACHE_TTL;
  }

  async getCachedSourceRecipes(): Promise<RecipeData[] | null> {
    try {
      const cached = await this.storage.getLocal<{
        recipes: RecipeData[];
        timestamp: number;
      }>(this.STORAGE_KEY_RECIPE_CONTENT);

      if (cached && this.isCacheValid(cached.timestamp)) {
        return cached.recipes;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get cached source recipes', error);
      return null;
    }
  }

  async clearStorageCache(): Promise<void> {
    try {
      await this.storage.removeItem(this.STORAGE_KEY_RECIPE_CONTENT, StorageType.LOCAL);
      await this.storage.removeItem(this.STORAGE_KEY_RECIPE_PROGRESS, StorageType.LOCAL);
      await this.storage.removeItem(this.STORAGE_KEY_POPULAR_RECIPES, StorageType.LOCAL);
      this.logger.info('Storage cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear storage cache', error);
    }
  }

  async clearAll(): Promise<void> {
    this.clearMemoryCache();
    await this.clearStorageCache();
    this.logger.info('All caches cleared');
  }

  async saveProgress(recipeId: string, progress: any): Promise<void> {
    try {
      const allProgress = await this.storage.getLocal<Record<string, any>>(
        this.STORAGE_KEY_RECIPE_PROGRESS
      ) || {};

      allProgress[recipeId] = {
        ...progress,
        timestamp: Date.now()
      };

      await this.storage.setLocal(this.STORAGE_KEY_RECIPE_PROGRESS, allProgress);
      this.logger.debug('Recipe progress saved', { recipeId });
    } catch (error) {
      this.logger.error('Failed to save recipe progress', error);
    }
  }

  async getProgress(recipeId: string): Promise<any | null> {
    try {
      const allProgress = await this.storage.getLocal<Record<string, any>>(
        this.STORAGE_KEY_RECIPE_PROGRESS
      ) || {};

      return allProgress[recipeId] || null;
    } catch (error) {
      this.logger.error('Failed to get recipe progress', error);
      return null;
    }
  }

  getCacheStats(): {
    recipeCount: number;
    contentCacheSize: number;
    hasStorageCache: boolean;
  } {
    return {
      recipeCount: this.getRecipes().length,
      contentCacheSize: this.contentCache.size,
      hasStorageCache: true
    };
  }
}
