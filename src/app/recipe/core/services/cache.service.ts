import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { Recipe, RecipeData } from '../models/recipe.model';
import { UnifiedStorageService } from '../storage/unified-storage.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private readonly STORAGE_KEY_RECIPE_CONTENT = 'recipe_content_cache_v2';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  private recipesCache$ = new BehaviorSubject<Recipe[]>([]);

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

  setRecipes(recipes: Recipe[]): void {
    this.recipesCache$.next(recipes);
    this.saveToStorage(recipes);
    this.logger.debug('Recipes cache updated', { count: recipes.length });
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
}
