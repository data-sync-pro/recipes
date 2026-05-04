import { Injectable } from '@angular/core';
import { RecipeData } from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';
import { createSafeString, getFileExtension } from '../../core/utils';

@Injectable({
  providedIn: 'root'
})
export class ImageNamingService {
  constructor(private logger: LoggerService) {
    this.logger.debug('ImageNamingService initialized');
  }

  generateImageName(file: File, recipe: RecipeData, stepIndex: number): string {
    try {
      if (!recipe) {
        return this.fallbackImageName();
      }

      // Get first category for naming (supports both string and string[])
      const categoryValue = Array.isArray(recipe.category) ? (recipe.category[0] || 'uncategorized') : (recipe.category || 'uncategorized');
      const category = createSafeString(categoryValue);
      const step = recipe.walkthrough?.[stepIndex];
      const stepName = createSafeString(step?.step || 'step');
      const extension = getFileExtension(file);
      const baseName = `${category}-${stepName}-image`;

      return this.ensureUniqueImageName(baseName, extension, recipe);
    } catch (error) {
      this.logger.error('Error generating image name:', error);
      return this.fallbackImageName();
    }
  }

  generateGeneralImageName(file: File, recipe: RecipeData): string {
    try {
      if (!recipe) {
        return 'general-image';
      }

      const existingCount = recipe.generalImages?.length || 0;
      const baseName = existingCount === 0 ? 'general-image' : `general-image-${existingCount + 1}`;
      const extension = getFileExtension(file);

      return this.ensureUniqueGeneralImageName(baseName, extension, recipe);
    } catch (error) {
      this.logger.error('Error generating general image name:', error);
      return 'general-image';
    }
  }

  extractBaseNameFromUrl(url: string): string {
    if (!url) return '';

    const fileName = url.replace('images/', '');
    const baseName = fileName.replace(/\.[^/.]+$/, '');

    return baseName;
  }

  private ensureUniqueImageName(
    baseName: string,
    extension: string,
    recipe: RecipeData
  ): string {
    const usedNames = this.collectUsedImageNames(recipe);

    let finalName = baseName;
    let counter = 1;

    while (usedNames.has(finalName)) {
      finalName = `${baseName}-${++counter}`;
    }

    return finalName;
  }

  private ensureUniqueGeneralImageName(
    baseName: string,
    extension: string,
    recipe: RecipeData
  ): string {
    const usedNames = this.collectUsedGeneralImageNames(recipe);

    let finalName = baseName;
    let counter = 2;

    while (usedNames.has(finalName)) {
      if (baseName === 'general-image') {
        finalName = `general-image-${counter}`;
      } else {
        const match = baseName.match(/general-image-(\d+)/);
        if (match) {
          const currentNum = parseInt(match[1]);
          finalName = `general-image-${currentNum + counter - 1}`;
        } else {
          finalName = `${baseName}-${counter}`;
        }
      }
      counter++;
    }

    return finalName;
  }

  private collectUsedImageNames(recipe: RecipeData): Set<string> {
    const usedNames = new Set<string>();

    if (recipe.walkthrough) {
      recipe.walkthrough.forEach(step => {
        if (step.media) {
          step.media.forEach(media => {
            if (media.url && media.url.startsWith('images/')) {
              const baseName = this.extractBaseNameFromUrl(media.url);
              usedNames.add(baseName);
            }
          });
        }
      });
    }

    return usedNames;
  }

  private collectUsedGeneralImageNames(recipe: RecipeData): Set<string> {
    const usedNames = new Set<string>();

    if (recipe.generalImages) {
      recipe.generalImages.forEach(image => {
        if (image.url && image.url.startsWith('images/')) {
          const baseName = this.extractBaseNameFromUrl(image.url);
          usedNames.add(baseName);
        }
      });
    }

    return usedNames;
  }

  private fallbackImageName(): string {
    return `image-${Date.now()}`;
  }

  /**
   * @deprecated Use getFileExtension from core/utils instead
   */
  getFileExtension(file: File): string {
    return getFileExtension(file);
  }
}
