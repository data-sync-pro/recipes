import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { RecipeData, normalizeCategory } from '../../core/models/recipe.model';
import { PreviewService } from '../../core/services/preview.service';
import { LoggerService } from '../../core/services/logger.service';
import { cleanRecipeForExport } from '../../core/utils';

/**
 * Recipe Preview Coordinator Service
 *
 * Single Responsibility: Coordinate recipe preview updates and synchronization
 *
 * Responsibilities:
 * - Trigger preview updates (debounced)
 * - Generate JSON preview for display
 * - Open preview in new tab
 * - Cross-tab preview synchronization
 * - External preview window updates
 */
@Injectable({
  providedIn: 'root'
})
export class PreviewCoordinatorService {

  /**
   * Subject for triggering preview updates (debounced)
   */
  private previewUpdateSubject = new Subject<{
    recipe: RecipeData;
    customStepNames: {[index: number]: string};
  }>();

  constructor(
    private previewService: PreviewService,
    private logger: LoggerService
  ) {
    this.setupPreviewUpdate();
  }

  // ==================== Preview Update Setup ====================

  /**
   * Setup debounced preview updates
   * Updates are debounced by 500ms to avoid excessive updates
   */
  private setupPreviewUpdate(): void {
    this.previewUpdateSubject
      .pipe(debounceTime(500))
      .subscribe(({ recipe, customStepNames }) => {
        this.updatePreview(recipe, customStepNames);
      });
  }

  /**
   * Trigger a preview update (debounced)
   * This method queues an update that will be executed after 500ms
   *
   * @param recipe - Recipe to preview
   * @param customStepNames - Custom step names mapping
   */
  triggerPreviewUpdate(
    recipe: RecipeData,
    customStepNames: {[index: number]: string}
  ): void {
    this.previewUpdateSubject.next({ recipe, customStepNames });
  }

  /**
   * Update preview immediately (internal method)
   *
   * @param recipe - Recipe to preview
   * @param customStepNames - Custom step names mapping
   */
  private updatePreview(
    recipe: RecipeData,
    customStepNames: {[index: number]: string}
  ): void {
    try {
      // Clean recipe for preview
      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);

      // Update preview service with RecipePreviewData
      this.previewService.updatePreviewData({
        recipeId: recipe.id,
        title: recipe.title,
        category: normalizeCategory(recipe.category),
        recipeData: cleanedRecipe,
        timestamp: Date.now()
      });

      this.logger.debug('Preview updated', { recipeId: recipe.id });
    } catch (error) {
      this.logger.error('Failed to update preview', error);
    }
  }

  // ==================== JSON Preview ====================

  /**
   * Generate JSON preview string for display
   *
   * @param recipe - Recipe to preview
   * @param customStepNames - Custom step names mapping
   * @returns Formatted JSON string
   */
  generateJsonPreview(
    recipe: RecipeData,
    customStepNames: {[index: number]: string}
  ): string {
    try {
      // Clean recipe and convert to JSON
      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);
      return JSON.stringify(cleanedRecipe, null, 2);
    } catch (error) {
      this.logger.error('Failed to generate JSON preview', error);
      return '{\n  "error": "Failed to generate preview"\n}';
    }
  }

  // ==================== Cross-Tab Preview ====================

  /**
   * Trigger cross-tab preview update
   * Updates preview data that can be accessed from other tabs
   *
   * @param recipe - Recipe to preview
   * @param customStepNames - Custom step names mapping
   */
  triggerCrossTabPreviewUpdate(
    recipe: RecipeData,
    customStepNames: {[index: number]: string}
  ): void {
    try {
      // Clean recipe for preview
      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);

      // Store in preview service (accessible across tabs)
      this.previewService.updatePreviewData({
        recipeId: recipe.id,
        title: recipe.title,
        category: normalizeCategory(recipe.category),
        recipeData: cleanedRecipe,
        timestamp: Date.now()
      });

      this.logger.debug('Cross-tab preview updated', { recipeId: recipe.id });
    } catch (error) {
      this.logger.error('Failed to update cross-tab preview', error);
    }
  }

  // ==================== External Preview Window ====================

  /**
   * Open preview in a new browser tab/window
   *
   * @param recipe - Recipe to preview
   * @param customStepNames - Custom step names mapping
   */
  openPreviewInNewTab(
    recipe: RecipeData,
    customStepNames: {[index: number]: string}
  ): void {
    try {
      // Clean recipe and store for preview
      const cleanedRecipe = cleanRecipeForExport(recipe, customStepNames);
      const previewData = {
        recipeId: recipe.id,
        title: recipe.title,
        category: normalizeCategory(recipe.category),
        recipeData: cleanedRecipe,
        timestamp: Date.now()
      };

      // Open preview URL using preview service
      this.previewService.openPreviewInNewTab(recipe.id, previewData);

      this.logger.info('Preview opened in new tab', { recipeId: recipe.id });
    } catch (error) {
      this.logger.error('Failed to open preview in new tab', error);
    }
  }


}
