import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  RecipeData,
  WalkthroughStep,
  StepConfig,
  StepMedia
} from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';

@Injectable({
  providedIn: 'root'
})
export class StepManagementService {

  private expandedStepsSubject = new BehaviorSubject<Set<number>>(new Set());
  public readonly expandedSteps$ = this.expandedStepsSubject.asObservable();

  private customStepNamesSubject = new BehaviorSubject<{[index: number]: string}>({});
  public readonly customStepNames$ = this.customStepNamesSubject.asObservable();

  // Map to store customStepNames per recipe (isolated state)
  private customStepNamesMap = new Map<string, {[index: number]: string}>();
  private currentRecipeId: string | null = null;

  constructor(private logger: LoggerService) {}

  /**
   * Set current recipe and load its customStepNames
   * Call this when switching recipes/tabs
   */
  setCurrentRecipe(recipeId: string): void {
    // Save current recipe's customStepNames before switching
    if (this.currentRecipeId && this.currentRecipeId !== recipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, { ...this.customStepNamesSubject.value });
    }

    this.currentRecipeId = recipeId;

    // Load the new recipe's customStepNames (or empty object if none)
    const names = this.customStepNamesMap.get(recipeId) || {};
    this.customStepNamesSubject.next(names);

    this.logger.debug('Switched to recipe customStepNames', { recipeId, names });
  }

  /**
   * Get customStepNames for a specific recipe
   */
  getCustomStepNamesForRecipe(recipeId: string): {[index: number]: string} {
    return this.customStepNamesMap.get(recipeId) || {};
  }

  /**
   * Clear customStepNames for a specific recipe
   */
  clearCustomStepNamesForRecipe(recipeId: string): void {
    this.customStepNamesMap.delete(recipeId);
    if (this.currentRecipeId === recipeId) {
      this.customStepNamesSubject.next({});
    }
  }

  /**
   * Clear all customStepNames (used when clearing all data)
   */
  clearAllCustomStepNames(): void {
    this.customStepNamesMap.clear();
    this.currentRecipeId = null;
    this.customStepNamesSubject.next({});
  }

  addStep(recipe: RecipeData): boolean {
    if (!recipe.walkthrough) {
      recipe.walkthrough = [];
    }

    const newStep: WalkthroughStep = {
      step: 'Custom',
      config: [],
      media: []
    };

    recipe.walkthrough.push(newStep);

    this.logger.debug('Step added', {
      recipeId: recipe.id,
      stepCount: recipe.walkthrough.length
    });

    return true;
  }

  removeStep(recipe: RecipeData, stepIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex < 0 || stepIndex >= recipe.walkthrough.length) {
      this.logger.warn('Invalid step index for removal', { stepIndex });
      return false;
    }

    recipe.walkthrough.splice(stepIndex, 1);

    // Clean up custom step names
    this.reindexCustomStepNames(recipe.walkthrough);

    this.logger.debug('Step removed', {
      recipeId: recipe.id,
      stepIndex,
      remaining: recipe.walkthrough.length
    });

    return true;
  }

  moveStepUp(recipe: RecipeData, stepIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex <= 0 || stepIndex >= recipe.walkthrough.length) {
      return false;
    }

    [recipe.walkthrough[stepIndex], recipe.walkthrough[stepIndex - 1]] =
      [recipe.walkthrough[stepIndex - 1], recipe.walkthrough[stepIndex]];

    // Reindex custom step names
    this.reindexCustomStepNames(recipe.walkthrough);

    this.logger.debug('Step moved up', { recipeId: recipe.id, from: stepIndex, to: stepIndex - 1 });

    return true;
  }

  moveStepDown(recipe: RecipeData, stepIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex < 0 || stepIndex >= recipe.walkthrough.length - 1) {
      return false;
    }

    [recipe.walkthrough[stepIndex], recipe.walkthrough[stepIndex + 1]] =
      [recipe.walkthrough[stepIndex + 1], recipe.walkthrough[stepIndex]];

    // Reindex custom step names
    this.reindexCustomStepNames(recipe.walkthrough);

    this.logger.debug('Step moved down', { recipeId: recipe.id, from: stepIndex, to: stepIndex + 1 });

    return true;
  }


  addConfig(recipe: RecipeData, stepIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex < 0 || stepIndex >= recipe.walkthrough.length) {
      this.logger.warn('Invalid step index for adding config', { stepIndex });
      return false;
    }

    const step = recipe.walkthrough[stepIndex];
    if (!step.config) {
      step.config = [];
    }

    const newConfig: StepConfig = {
      field: '',
      value: ''
    };

    step.config.push(newConfig);

    this.logger.debug('Config added', { recipeId: recipe.id, stepIndex, configCount: step.config.length });

    return true;
  }

  removeConfig(recipe: RecipeData, stepIndex: number, configIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex < 0 || stepIndex >= recipe.walkthrough.length) {
      this.logger.warn('Invalid step index for removing config', { stepIndex });
      return false;
    }

    const step = recipe.walkthrough[stepIndex];
    if (!step.config || configIndex < 0 || configIndex >= step.config.length) {
      this.logger.warn('Invalid config index for removal', { configIndex });
      return false;
    }

    step.config.splice(configIndex, 1);

    this.logger.debug('Config removed', { recipeId: recipe.id, stepIndex, configIndex });

    return true;
  }

  addMedia(recipe: RecipeData, stepIndex: number): boolean {
    if (!recipe.walkthrough || stepIndex < 0 || stepIndex >= recipe.walkthrough.length) {
      this.logger.warn('Invalid step index for adding media', { stepIndex });
      return false;
    }

    const step = recipe.walkthrough[stepIndex];
    if (!step.media) {
      step.media = [];
    }

    const newMedia: StepMedia = {
      type: 'image',
      url: '',
      alt: ''
    };

    step.media.push(newMedia);

    this.logger.debug('Media added', { recipeId: recipe.id, stepIndex, mediaCount: step.media.length });

    return true;
  }

  initializeExpandedSteps(recipe: RecipeData): void {
    const expanded = new Set<number>();

    if (recipe.walkthrough && recipe.walkthrough.length > 0) {
      // Expand first step by default
      expanded.add(0);
    }

    this.expandedStepsSubject.next(expanded);
  }

  toggleStep(stepIndex: number): void {
    const currentExpanded = new Set(this.expandedStepsSubject.value);

    if (currentExpanded.has(stepIndex)) {
      currentExpanded.delete(stepIndex);
    } else {
      currentExpanded.add(stepIndex);
    }

    this.expandedStepsSubject.next(currentExpanded);
  }


  isStepExpanded(stepIndex: number): boolean {
    return this.expandedStepsSubject.value.has(stepIndex);
  }


  expandStep(stepIndex: number): void {
    const currentExpanded = new Set(this.expandedStepsSubject.value);
    currentExpanded.add(stepIndex);
    this.expandedStepsSubject.next(currentExpanded);
  }


  onStepSelectionChange(step: WalkthroughStep, stepIndex: number): void {
    const currentNames = { ...this.customStepNamesSubject.value };

    if (step.step === 'Custom') {
      if (!currentNames[stepIndex]) {
        currentNames[stepIndex] = 'Custom Step';
      }
    } else {
      delete currentNames[stepIndex];
    }

    this.customStepNamesSubject.next(currentNames);

    // Save to map for current recipe
    if (this.currentRecipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, currentNames);
    }
  }

  onCustomStepNameChange(stepIndex: number, customName: string): void {
    const currentNames = { ...this.customStepNamesSubject.value };
    currentNames[stepIndex] = customName;
    this.customStepNamesSubject.next(currentNames);

    // Save to map for current recipe
    if (this.currentRecipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, currentNames);
    }

    this.logger.debug('Custom step name changed', { stepIndex, customName });
  }

  reindexCustomStepNames(steps: WalkthroughStep[]): void {
    const currentNames = this.customStepNamesSubject.value;
    const newNames: {[index: number]: string} = {};

    steps.forEach((step, index) => {
      if (step.step === 'Custom' && currentNames[index]) {
        newNames[index] = currentNames[index];
      }
    });

    this.customStepNamesSubject.next(newNames);

    // Save to map for current recipe
    if (this.currentRecipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, newNames);
    }
  }

  getStepTitle(step: WalkthroughStep, stepIndex: number): string {
    if (step.step === 'Custom') {
      const customNames = this.customStepNamesSubject.value;
      return customNames[stepIndex] || 'Custom Step';
    }
    return step.step;
  }

  isCustomStep(step: WalkthroughStep): boolean {
    return step.step === 'Custom';
  }

}
