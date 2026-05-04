import { Injectable } from '@angular/core';
import {
  RecipeData,
  WalkthroughStep,
  PrerequisiteRecipe,
  StepMedia,
  StepConfig,
  GeneralImage,
  normalizeCategory
} from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  field: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  constructor(private logger: LoggerService) {
    this.logger.debug('ValidationService initialized');
  }

  validateRecipe(recipe: RecipeData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    errors.push(...this.validateRequiredFields(recipe));

    if (recipe.id && !this.isValidId(recipe.id)) {
      errors.push({
        field: 'id',
        message: 'Recipe ID must contain only alphanumeric characters, hyphens, and underscores',
        severity: 'error'
      });
    }

    // Validate each category in the array
    const categories = normalizeCategory(recipe.category);
    categories.forEach((cat, index) => {
      if (cat && !this.isValidCategory(cat)) {
        errors.push({
          field: `category[${index}]`,
          message: `Invalid category value: ${cat}`,
          severity: 'error'
        });
      }
    });

    if (recipe.walkthrough && recipe.walkthrough.length > 0) {
      const stepResults = this.validateWalkthroughSteps(recipe.walkthrough);
      errors.push(...stepResults.errors);
      warnings.push(...stepResults.warnings);
    } else {
      warnings.push({
        field: 'walkthrough',
        message: 'Recipe has no walkthrough steps'
      });
    }

    if (recipe.prerequisites && recipe.prerequisites.length > 0) {
      const prereqResults = this.validatePrerequisites(recipe.prerequisites);
      errors.push(...prereqResults.errors);
      warnings.push(...prereqResults.warnings);
    }

    if (recipe.generalImages && recipe.generalImages.length > 0) {
      const imageResults = this.validateGeneralImages(recipe.generalImages);
      errors.push(...imageResults.errors);
      warnings.push(...imageResults.warnings);
    }

    if (!recipe.overview || recipe.overview.trim() === '') {
      warnings.push({
        field: 'overview',
        message: 'Recipe overview is empty'
      });
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings
    };

    if (!result.valid) {
      this.logger.warn('Recipe validation failed', {
        recipeId: recipe.id,
        errorCount: errors.length,
        warningCount: warnings.length
      });
    }

    return result;
  }

  private validateRequiredFields(recipe: RecipeData): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!recipe.id || recipe.id.trim() === '') {
      errors.push({
        field: 'id',
        message: 'Recipe ID is required',
        severity: 'critical'
      });
    }

    if (!recipe.title || recipe.title.trim() === '') {
      errors.push({
        field: 'title',
        message: 'Recipe title is required',
        severity: 'critical'
      });
    }

    // Check category array is not empty
    const categories = normalizeCategory(recipe.category);
    if (categories.length === 0) {
      errors.push({
        field: 'category',
        message: 'At least one category is required',
        severity: 'error'
      });
    }

    return errors;
  }

  private isValidId(id: string): boolean {
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    return idPattern.test(id);
  }

  private isValidCategory(category: string): boolean {
    const validCategories = [
      'Batch',
      'Trigger',
      'Data List',
      'Action Button',
      'Data Loader',
      'General',
      'Transformation',
      'Query'
    ];
    return validCategories.includes(category);
  }

  private validateWalkthroughSteps(steps: WalkthroughStep[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    steps.forEach((step, index) => {
      const stepLabel = `walkthrough[${index}]`;

      if (!step.step || step.step.trim() === '') {
        errors.push({
          field: `${stepLabel}.step`,
          message: `Step ${index + 1} is missing a step name`,
          severity: 'error'
        });
      }

      if (step.config && step.config.length > 0) {
        const configResults = this.validateStepConfig(step.config, index);
        errors.push(...configResults.errors);
        warnings.push(...configResults.warnings);
      }

      if (step.media && step.media.length > 0) {
        const mediaResults = this.validateStepMedia(step.media, index);
        errors.push(...mediaResults.errors);
        warnings.push(...mediaResults.warnings);
      }
    });

    return { errors, warnings };
  }

  private validateStepConfig(config: StepConfig[], stepIndex: number): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    config.forEach((item, configIndex) => {
      const fieldLabel = `walkthrough[${stepIndex}].config[${configIndex}]`;

      if (!item.field || item.field.trim() === '') {
        errors.push({
          field: `${fieldLabel}.field`,
          message: `Step ${stepIndex + 1}, config ${configIndex + 1}: field name is missing`,
          severity: 'error'
        });
      }

      if (item.value === undefined || item.value === null) {
        warnings.push({
          field: `${fieldLabel}.value`,
          message: `Step ${stepIndex + 1}, config "${item.field || configIndex + 1}": value is empty`
        });
      }
    });

    return { errors, warnings };
  }

  private validateStepMedia(media: StepMedia[], stepIndex: number): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    media.forEach((item, mediaIndex) => {
      const fieldLabel = `walkthrough[${stepIndex}].media[${mediaIndex}]`;

      if (!item.url || item.url.trim() === '') {
        errors.push({
          field: `${fieldLabel}.url`,
          message: `Step ${stepIndex + 1}, media ${mediaIndex + 1}: image URL is missing`,
          severity: 'error'
        });
      }

      if (!item.alt || item.alt.trim() === '') {
        warnings.push({
          field: `${fieldLabel}.alt`,
          message: `Step ${stepIndex + 1}, media ${mediaIndex + 1}: alt text is missing`
        });
      }
    });

    return { errors, warnings };
  }

  private validatePrerequisites(prerequisites: PrerequisiteRecipe[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    prerequisites.forEach((prereq, index) => {
      const fieldLabel = `prerequisites[${index}]`;

      if (!prereq.description || prereq.description.trim() === '') {
        errors.push({
          field: `${fieldLabel}.description`,
          message: `Prerequisite ${index + 1}: description is required`,
          severity: 'error'
        });
      }

      if (prereq.quickLinks && prereq.quickLinks.length > 0) {
        prereq.quickLinks.forEach((link, linkIndex) => {
          if (!link.title || link.title.trim() === '') {
            warnings.push({
              field: `${fieldLabel}.quickLinks[${linkIndex}].title`,
              message: `Prerequisite ${index + 1}, Quick Link ${linkIndex + 1}: title is missing`
            });
          }
          if (!link.url || link.url.trim() === '') {
            warnings.push({
              field: `${fieldLabel}.quickLinks[${linkIndex}].url`,
              message: `Prerequisite ${index + 1}, Quick Link ${linkIndex + 1}: URL is missing`
            });
          }
        });
      }
    });

    return { errors, warnings };
  }

  private validateGeneralImages(images: GeneralImage[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    images.forEach((image, index) => {
      const fieldLabel = `generalImages[${index}]`;

      if (!image.url || image.url.trim() === '') {
        errors.push({
          field: `${fieldLabel}.url`,
          message: `General image ${index + 1}: image URL is required`,
          severity: 'error'
        });
      }

      if (!image.alt || image.alt.trim() === '') {
        warnings.push({
          field: `${fieldLabel}.alt`,
          message: `General image ${index + 1}: alt text is missing`
        });
      }
    });

    return { errors, warnings };
  }

}
