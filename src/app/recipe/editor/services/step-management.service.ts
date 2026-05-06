import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  RecipeData,
  WalkthroughStep,
  WalkthroughTab,
  StepConfig,
  StepMedia,
  isLegacyWalkthrough
} from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';

// 2D map of custom step names: customStepNamesMap[tabIndex][stepIndex] = name
export type CustomStepNames = { [tabIndex: number]: { [stepIndex: number]: string } };

@Injectable({
  providedIn: 'root'
})
export class StepManagementService {

  // expandedSteps uses composite keys "tabIndex-stepIndex" to scope per-tab
  private expandedStepsSubject = new BehaviorSubject<Set<string>>(new Set());
  public readonly expandedSteps$ = this.expandedStepsSubject.asObservable();

  private customStepNamesSubject = new BehaviorSubject<CustomStepNames>({});
  public readonly customStepNames$ = this.customStepNamesSubject.asObservable();

  // Map to store customStepNames per recipe (isolated state)
  private customStepNamesMap = new Map<string, CustomStepNames>();
  private currentRecipeId: string | null = null;

  constructor(private logger: LoggerService) {}

  // ==================== Recipe / Tab Setup ====================

  /**
   * Ensure the recipe's walkthrough is in tab-grouped form. Legacy flat
   * WalkthroughStep[] arrays are wrapped into a single default tab in place.
   */
  ensureTabFormat(recipe: RecipeData): WalkthroughTab[] {
    if (!recipe.walkthrough) {
      recipe.walkthrough = [];
      return recipe.walkthrough as WalkthroughTab[];
    }
    if (isLegacyWalkthrough(recipe.walkthrough)) {
      const wrapped: WalkthroughTab[] = [
        { tab: 'Walkthrough', steps: recipe.walkthrough as WalkthroughStep[] }
      ];
      recipe.walkthrough = wrapped;
    }
    return recipe.walkthrough as WalkthroughTab[];
  }

  setCurrentRecipe(recipeId: string): void {
    if (this.currentRecipeId && this.currentRecipeId !== recipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, this.cloneNames(this.customStepNamesSubject.value));
    }

    this.currentRecipeId = recipeId;

    const names = this.customStepNamesMap.get(recipeId) || {};
    this.customStepNamesSubject.next(names);

    this.logger.debug('Switched to recipe customStepNames', { recipeId, names });
  }

  getCustomStepNamesForRecipe(recipeId: string): CustomStepNames {
    return this.customStepNamesMap.get(recipeId) || {};
  }

  clearCustomStepNamesForRecipe(recipeId: string): void {
    this.customStepNamesMap.delete(recipeId);
    if (this.currentRecipeId === recipeId) {
      this.customStepNamesSubject.next({});
    }
  }

  clearAllCustomStepNames(): void {
    this.customStepNamesMap.clear();
    this.currentRecipeId = null;
    this.customStepNamesSubject.next({});
  }

  // ==================== Tab Operations ====================

  addTab(recipe: RecipeData, label?: string): boolean {
    const tabs = this.ensureTabFormat(recipe);
    const newTab: WalkthroughTab = {
      tab: label || `Tab ${tabs.length + 1}`,
      steps: []
    };
    tabs.push(newTab);
    this.logger.debug('Tab added', { recipeId: recipe.id, tabCount: tabs.length });
    return true;
  }

  removeTab(recipe: RecipeData, tabIndex: number): boolean {
    const tabs = this.ensureTabFormat(recipe);
    if (tabIndex < 0 || tabIndex >= tabs.length) return false;

    tabs.splice(tabIndex, 1);
    this.removeTabFromCustomNames(tabIndex);

    this.logger.debug('Tab removed', { recipeId: recipe.id, tabIndex, remaining: tabs.length });
    return true;
  }

  moveTabUp(recipe: RecipeData, tabIndex: number): boolean {
    const tabs = this.ensureTabFormat(recipe);
    if (tabIndex <= 0 || tabIndex >= tabs.length) return false;
    [tabs[tabIndex - 1], tabs[tabIndex]] = [tabs[tabIndex], tabs[tabIndex - 1]];
    this.swapTabsInCustomNames(tabIndex - 1, tabIndex);
    return true;
  }

  moveTabDown(recipe: RecipeData, tabIndex: number): boolean {
    const tabs = this.ensureTabFormat(recipe);
    if (tabIndex < 0 || tabIndex >= tabs.length - 1) return false;
    [tabs[tabIndex], tabs[tabIndex + 1]] = [tabs[tabIndex + 1], tabs[tabIndex]];
    this.swapTabsInCustomNames(tabIndex, tabIndex + 1);
    return true;
  }

  renameTab(recipe: RecipeData, tabIndex: number, label: string): boolean {
    const tabs = this.ensureTabFormat(recipe);
    if (tabIndex < 0 || tabIndex >= tabs.length) return false;
    tabs[tabIndex].tab = label;
    return true;
  }

  // ==================== Step Operations ====================

  private getTab(recipe: RecipeData, tabIndex: number): WalkthroughTab | null {
    const tabs = this.ensureTabFormat(recipe);
    if (tabIndex < 0 || tabIndex >= tabs.length) return null;
    return tabs[tabIndex];
  }

  addStep(recipe: RecipeData, tabIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab) return false;
    if (!tab.steps) tab.steps = [];

    const newStep: WalkthroughStep = {
      step: 'Custom',
      config: [],
      media: []
    };
    tab.steps.push(newStep);

    this.logger.debug('Step added', {
      recipeId: recipe.id,
      tabIndex,
      stepCount: tab.steps.length
    });
    return true;
  }

  removeStep(recipe: RecipeData, tabIndex: number, stepIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps || stepIndex < 0 || stepIndex >= tab.steps.length) {
      this.logger.warn('Invalid step index for removal', { tabIndex, stepIndex });
      return false;
    }

    tab.steps.splice(stepIndex, 1);
    this.reindexCustomStepNamesForTab(tabIndex, tab.steps);
    return true;
  }

  moveStepUp(recipe: RecipeData, tabIndex: number, stepIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps || stepIndex <= 0 || stepIndex >= tab.steps.length) return false;

    [tab.steps[stepIndex - 1], tab.steps[stepIndex]] = [tab.steps[stepIndex], tab.steps[stepIndex - 1]];
    this.swapStepsInCustomNames(tabIndex, stepIndex - 1, stepIndex);
    return true;
  }

  moveStepDown(recipe: RecipeData, tabIndex: number, stepIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps || stepIndex < 0 || stepIndex >= tab.steps.length - 1) return false;

    [tab.steps[stepIndex], tab.steps[stepIndex + 1]] = [tab.steps[stepIndex + 1], tab.steps[stepIndex]];
    this.swapStepsInCustomNames(tabIndex, stepIndex, stepIndex + 1);
    return true;
  }

  addConfig(recipe: RecipeData, tabIndex: number, stepIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps[stepIndex]) {
      this.logger.warn('Invalid step index for adding config', { tabIndex, stepIndex });
      return false;
    }
    const step = tab.steps[stepIndex];
    if (!step.config) step.config = [];
    step.config.push({ field: '', value: '' });
    return true;
  }

  removeConfig(recipe: RecipeData, tabIndex: number, stepIndex: number, configIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps[stepIndex]) return false;
    const step = tab.steps[stepIndex];
    if (!step.config || configIndex < 0 || configIndex >= step.config.length) return false;
    step.config.splice(configIndex, 1);
    return true;
  }

  addMedia(recipe: RecipeData, tabIndex: number, stepIndex: number): boolean {
    const tab = this.getTab(recipe, tabIndex);
    if (!tab || !tab.steps[stepIndex]) return false;
    const step = tab.steps[stepIndex];
    if (!step.media) step.media = [];
    step.media.push({ type: 'image', url: '', alt: '' });
    return true;
  }

  // ==================== Expanded State ====================

  initializeExpandedSteps(recipe: RecipeData): void {
    const expanded = new Set<string>();
    const tabs = this.ensureTabFormat(recipe);
    if (tabs.length > 0 && tabs[0].steps && tabs[0].steps.length > 0) {
      expanded.add('0-0');
    }
    this.expandedStepsSubject.next(expanded);
  }

  toggleStep(tabIndex: number, stepIndex: number): void {
    const key = `${tabIndex}-${stepIndex}`;
    const next = new Set(this.expandedStepsSubject.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedStepsSubject.next(next);
  }

  isStepExpanded(tabIndex: number, stepIndex: number): boolean {
    return this.expandedStepsSubject.value.has(`${tabIndex}-${stepIndex}`);
  }

  expandStep(tabIndex: number, stepIndex: number): void {
    const key = `${tabIndex}-${stepIndex}`;
    const next = new Set(this.expandedStepsSubject.value);
    next.add(key);
    this.expandedStepsSubject.next(next);
  }

  // ==================== Custom Step Names ====================

  onStepSelectionChange(step: WalkthroughStep, tabIndex: number, stepIndex: number): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    if (step.step === 'Custom') {
      if (!names[tabIndex]) names[tabIndex] = {};
      if (!names[tabIndex][stepIndex]) names[tabIndex][stepIndex] = 'Custom Step';
    } else if (names[tabIndex]) {
      delete names[tabIndex][stepIndex];
      if (Object.keys(names[tabIndex]).length === 0) delete names[tabIndex];
    }
    this.publishNames(names);
  }

  onCustomStepNameChange(tabIndex: number, stepIndex: number, customName: string): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    if (!names[tabIndex]) names[tabIndex] = {};
    names[tabIndex][stepIndex] = customName;
    this.publishNames(names);
    this.logger.debug('Custom step name changed', { tabIndex, stepIndex, customName });
  }

  /**
   * After step removal/reorder within a tab, rebuild customStepNames for that
   * tab to match the new step indexing.
   */
  reindexCustomStepNamesForTab(tabIndex: number, steps: WalkthroughStep[]): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    const oldTab = names[tabIndex] || {};
    const newTab: { [si: number]: string } = {};
    steps.forEach((step, si) => {
      if (step.step === 'Custom' && oldTab[si]) {
        newTab[si] = oldTab[si];
      }
    });
    if (Object.keys(newTab).length > 0) {
      names[tabIndex] = newTab;
    } else {
      delete names[tabIndex];
    }
    this.publishNames(names);
  }

  /**
   * Walk every tab and rebuild customStepNames in one pass. Used after
   * structural changes (tab removed, tabs reordered) to keep names aligned.
   */
  reindexAllCustomStepNames(tabs: WalkthroughTab[]): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    const fresh: CustomStepNames = {};
    tabs.forEach((tab, ti) => {
      const tabNames = names[ti] || {};
      const next: { [si: number]: string } = {};
      (tab.steps || []).forEach((step, si) => {
        if (step.step === 'Custom' && tabNames[si]) {
          next[si] = tabNames[si];
        }
      });
      if (Object.keys(next).length > 0) fresh[ti] = next;
    });
    this.publishNames(fresh);
  }

  getStepTitle(step: WalkthroughStep, tabIndex: number, stepIndex: number): string {
    if (step.step === 'Custom') {
      const tabNames = this.customStepNamesSubject.value[tabIndex];
      return (tabNames && tabNames[stepIndex]) || 'Custom Step';
    }
    return step.step;
  }

  isCustomStep(step: WalkthroughStep): boolean {
    return step.step === 'Custom';
  }

  // ==================== Private Helpers ====================

  private cloneNames(names: CustomStepNames): CustomStepNames {
    const out: CustomStepNames = {};
    for (const ti of Object.keys(names)) {
      out[+ti] = { ...names[+ti] };
    }
    return out;
  }

  private publishNames(names: CustomStepNames): void {
    this.customStepNamesSubject.next(names);
    if (this.currentRecipeId) {
      this.customStepNamesMap.set(this.currentRecipeId, names);
    }
  }

  private removeTabFromCustomNames(removedTabIndex: number): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    const fresh: CustomStepNames = {};
    for (const tiStr of Object.keys(names)) {
      const ti = +tiStr;
      if (ti < removedTabIndex) fresh[ti] = names[ti];
      else if (ti > removedTabIndex) fresh[ti - 1] = names[ti];
      // ti === removedTabIndex → drop
    }
    this.publishNames(fresh);
  }

  private swapTabsInCustomNames(a: number, b: number): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    const tmp = names[a];
    if (names[b]) names[a] = names[b]; else delete names[a];
    if (tmp) names[b] = tmp; else delete names[b];
    this.publishNames(names);
  }

  private swapStepsInCustomNames(tabIndex: number, a: number, b: number): void {
    const names = this.cloneNames(this.customStepNamesSubject.value);
    const tab = names[tabIndex];
    if (!tab) return;
    const tmp = tab[a];
    if (tab[b] !== undefined) tab[a] = tab[b]; else delete tab[a];
    if (tmp !== undefined) tab[b] = tmp; else delete tab[b];
    this.publishNames(names);
  }
}
