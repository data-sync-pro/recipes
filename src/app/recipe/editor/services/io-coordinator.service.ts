import { Injectable } from '@angular/core';
import { RecipeData, Recipe } from '../../core/models/recipe.model';
import { StorageService } from './storage.service';
import { ExportService } from '../../core/services/export.service';
import { IOProgress } from '../../core/services/io.types';
import { FileStorageAdapter } from '../../core/storage';
import { ValidationService, ValidationResult } from './validation.service';
import { LoggerService } from '../../core/services/logger.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { cleanRecipeForExport, CleanRecipeCustomStepNames } from '../../core/utils';

export interface SaveResult {
  success: boolean;
  recipeId?: string;
  errors?: string[];
}

export interface ImportResult {
  success: boolean;
  recipe?: RecipeData;
  recipes?: RecipeData[];
  errors?: string[];
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class IOCoordinatorService {

  constructor(
    private storageService: StorageService,
    private exportService: ExportService,
    private fileStorageService: FileStorageAdapter,
    private validationService: ValidationService,
    private logger: LoggerService,
    private notificationService: NotificationService
  ) {}

  getEditedRecipe(recipeId: string): RecipeData | null {
    return this.storageService.getEditedRecipe(recipeId);
  }

  saveRecipe(
    recipe: RecipeData,
    customStepNames: CleanRecipeCustomStepNames
  ): SaveResult {
    try {
      const validationResult: ValidationResult = this.validationService.validateRecipe(recipe);
      if (validationResult.errors.length > 0) {
        this.logger.warn('Recipe validation failed', { recipeId: recipe.id, errors: validationResult.errors });
        this.notificationService.warning(
          `Recipe has ${validationResult.errors.length} validation issue(s). Please review.`
        );
      }

      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);
      this.storageService.saveRecipe(cleanedRecipe);
      this.saveRecipeImages(cleanedRecipe);

      this.logger.info('Recipe saved successfully', { recipeId: recipe.id });
      this.notificationService.success('Recipe saved successfully!');

      return {
        success: true,
        recipeId: recipe.id,
        errors: validationResult.errors.length > 0
          ? validationResult.errors.map(e => `${e.field}: ${e.message}`)
          : undefined
      };

    } catch (error) {
      this.logger.error('Failed to save recipe', error);
      this.notificationService.error('Failed to save recipe. Please try again.');

      return {
        success: false,
        errors: [(error as Error).message]
      };
    }
  }

  saveMultipleRecipes(
    recipes: RecipeData[],
    customStepNames: CleanRecipeCustomStepNames
  ): SaveResult[] {
    const results: SaveResult[] = [];

    for (const recipe of recipes) {
      const result = this.saveRecipe(recipe, customStepNames);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info('Batch save completed', {
      total: recipes.length,
      success: successCount,
      failed: recipes.length - successCount
    });

    if (successCount === recipes.length) {
      this.notificationService.success(`All ${recipes.length} recipes saved successfully!`);
    } else {
      this.notificationService.warning(
        `Saved ${successCount} of ${recipes.length} recipes. Some failed.`
      );
    }

    return results;
  }

  async exportSingleRecipe(
    recipe: RecipeData,
    customStepNames: CleanRecipeCustomStepNames
  ): Promise<void> {
    try {
      const validationResult: ValidationResult = this.validationService.validateRecipe(recipe);
      if (validationResult.errors.length > 0) {
        this.logger.warn('Exporting recipe with validation warnings', {
          recipeId: recipe.id,
          warningCount: validationResult.errors.length
        });
      }

      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);
      await this.exportService.exportSingleRecipe(cleanedRecipe);

      this.logger.info('Recipe exported successfully', { recipeId: recipe.id });
      this.notificationService.success('Recipe exported successfully!');

    } catch (error) {
      this.logger.error('Failed to export recipe', error);
      this.notificationService.error('Failed to export recipe. Please try again.');
      throw error;
    }
  }

  async exportEditedRecipes(
    editedRecipes: RecipeData[],
    originalRecipes: Recipe[],
    progressCallback?: (progress: IOProgress) => void,
    recipeActiveStates?: Map<string, boolean>
  ): Promise<void> {
    try {
      if (editedRecipes.length === 0) {
        this.notificationService.warning('No edited recipes to export.');
        return;
      }

      this.logger.info('Starting edited recipes export', { count: editedRecipes.length });

      // Export only edited recipe folders, but include all recipes in index.json
      const allRecipesForIndex = this.mergeRecipeData(originalRecipes, editedRecipes);

      await this.exportService.exportAllAsZip(
        editedRecipes,
        this.fileStorageService,
        allRecipesForIndex,
        progressCallback,
        recipeActiveStates
      );

      this.logger.info('Edited recipes export completed successfully', {
        editedCount: editedRecipes.length,
        indexCount: allRecipesForIndex.length
      });
      this.notificationService.success(`Exported ${editedRecipes.length} edited recipe(s) with complete index!`);

    } catch (error) {
      this.logger.error('Failed to export edited recipes', error);
      this.notificationService.error('Failed to export recipes. Please try again.');
      throw error;
    }
  }

  async exportAllRecipes(
    editedRecipes: RecipeData[],
    originalRecipes: Recipe[],
    progressCallback?: (progress: IOProgress) => void,
    recipeActiveStates?: Map<string, boolean>
  ): Promise<void> {
    try {
      this.logger.info('Starting full export', { editedCount: editedRecipes.length, totalCount: originalRecipes.length });

      const recipesToExport = this.mergeRecipeData(originalRecipes, editedRecipes);

      await this.exportService.exportAllAsZip(
        recipesToExport,
        this.fileStorageService,
        recipesToExport,
        progressCallback,
        recipeActiveStates
      );

      this.logger.info('Full export completed successfully', { count: recipesToExport.length });
      this.notificationService.success(`Exported ${recipesToExport.length} recipes successfully!`);

    } catch (error) {
      this.logger.error('Failed to export all recipes', error);
      this.notificationService.error('Failed to export recipes. Please try again.');
      throw error;
    }
  }

  async importFromFile(file: File): Promise<ImportResult> {
    try {
      this.logger.info('Starting import from file', { fileName: file.name });

      const content = await this.readFileAsText(file);
      const recipe = JSON.parse(content) as RecipeData;

      const validationResult: ValidationResult = this.validationService.validateRecipe(recipe);
      if (validationResult.errors.length > 0) {
        this.logger.warn('Imported recipe has validation issues', { errors: validationResult.errors });
        this.notificationService.warning(
          `Recipe imported with ${validationResult.errors.length} validation warning(s).`
        );
      }

      this.storageService.saveRecipe(recipe);

      this.logger.info('Recipe imported successfully', { recipeId: recipe.id });
      this.notificationService.success('Recipe imported successfully!');

      return {
        success: true,
        recipe,
        errors: validationResult.errors.length > 0
          ? validationResult.errors.map(e => `${e.field}: ${e.message}`)
          : undefined,
        message: 'Recipe imported successfully'
      };

    } catch (error) {
      this.logger.error('Failed to import recipe from file', error);
      this.notificationService.error('Failed to import recipe. Invalid file format.');

      return {
        success: false,
        errors: [(error as Error).message],
        message: 'Failed to import recipe'
      };
    }
  }

  mergeRecipeData(
    originalRecipes: Recipe[],
    editedRecipes: RecipeData[]
  ): RecipeData[] {
    const editedMap = new Map<string, RecipeData>();

    editedRecipes.forEach(recipe => {
      if (recipe.id) {
        editedMap.set(recipe.id, recipe);
      }
    });

    const result = [...editedRecipes];

    originalRecipes.forEach(originalRecipe => {
      if (!editedMap.has(originalRecipe.id)) {
        const sourceRecord: RecipeData = {
          id: originalRecipe.id,
          title: originalRecipe.title,
          category: originalRecipe.category,
          DSPVersions: originalRecipe.DSPVersions,
          overview: originalRecipe.overview,
          generalUseCase: originalRecipe.generalUseCase,
          generalImages: originalRecipe.generalImages,
          prerequisites: originalRecipe.prerequisites,
          pipeline: originalRecipe.pipeline,
          direction: originalRecipe.direction,
          connection: originalRecipe.connection,
          walkthrough: originalRecipe.walkthrough,
          verificationGIF: originalRecipe.verificationGIF || [],
          downloadableExecutables: originalRecipe.downloadableExecutables,
          relatedRecipes: originalRecipe.relatedRecipes,
          keywords: originalRecipe.keywords
        };

        // Preserve __folderId for asset path resolution during export
        if ((originalRecipe as any).__folderId) {
          (sourceRecord as any).__folderId = (originalRecipe as any).__folderId;
        }

        result.push(sourceRecord);
      }
    });

    this.logger.debug('Merged recipe data', {
      originalCount: originalRecipes.length,
      editedCount: editedRecipes.length,
      resultCount: result.length
    });

    return result;
  }

  clearAllData(): void {
    try {
      const editedCount = this.storageService.getAllEditedRecipes().length;

      if (editedCount === 0) {
        this.notificationService.info('No data to clear.');
        return;
      }

      const editedRecipes = this.storageService.getAllEditedRecipes();
      for (const recipe of editedRecipes) {
        if (recipe.id) {
          this.storageService.clearRecipe(recipe.id);
        }
      }

      this.fileStorageService.clearAll();

      // Clear all active states
      this.storageService.clearAllActiveStates();

      this.logger.info('All edited data cleared', { count: editedCount });
      this.notificationService.success(`Cleared ${editedCount} edited recipe(s).`);

    } catch (error) {
      this.logger.error('Failed to clear data', error);
      this.notificationService.error('Failed to clear data. Please try again.');
    }
  }

  private async saveRecipeImages(recipe: RecipeData): Promise<void> {
    this.logger.debug('Image storage check', { recipeId: recipe.id });
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }
}
