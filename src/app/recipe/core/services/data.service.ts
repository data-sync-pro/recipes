import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, combineLatest } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { LoggerService } from './logger.service';
import { RecipeData, RecipeIndexItem } from '../models/recipe.model';
import { RECIPE_PATHS } from '../constants/recipe.constants';

interface RecipeDataWithMetadata extends RecipeData {
  __folderId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly RECIPE_INDEX_URL = 'assets/recipes/index.json';

  constructor(
    private http: HttpClient,
    private logger: LoggerService
  ) {}

  loadAllRecipes(): Observable<RecipeData[]> {
    return this.loadRecipeIndex().pipe(
      switchMap(activeRecipes => this.loadRecipesBatch(activeRecipes)),
      catchError(error => {
        this.logger.error('Failed to load recipes', error);
        return of([]);
      })
    );
  }

  private loadRecipeIndex(): Observable<RecipeIndexItem[]> {
    return this.http.get<{ recipes: RecipeIndexItem[] }>(this.RECIPE_INDEX_URL).pipe(
      map(indexConfig => indexConfig.recipes.filter(item => item.active)),
      catchError(error => {
        this.logger.error('Failed to load recipe index', error);
        return of([]);
      })
    );
  }

  private loadRecipesBatch(recipeIndexItems: RecipeIndexItem[]): Observable<RecipeData[]> {
    if (recipeIndexItems.length === 0) {
      return of([]);
    }

    const recipeRequests = recipeIndexItems.map(recipeIndex =>
      this.loadSingleRecipe(recipeIndex.folderId).pipe(
        map(recipe => {
          if (recipe) {
            (recipe as RecipeDataWithMetadata).__folderId = recipeIndex.folderId;
          }
          return recipe;
        })
      )
    );

    return combineLatest(recipeRequests).pipe(
      map(recipes => recipes.filter(recipe => recipe !== null) as RecipeData[])
    );
  }

  private loadSingleRecipe(folderId: string): Observable<RecipeData | null> {
    const url = `${RECIPE_PATHS.RECIPE_FOLDERS_BASE}${folderId}/recipe.json`;

    return this.http.get<RecipeData>(url).pipe(
      catchError(error => {
        this.logger.warn(`Failed to load recipe from folder ${folderId}`, error);
        return of(null);
      })
    );
  }
}
