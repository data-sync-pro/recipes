import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  RecipeData,
  WalkthroughStep,
  WalkthroughTab,
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

  clearAllCustomStepNames(): void {
    this.customStepNamesMap.clear();
    this.currentRecipeId = null;
    this.customStepNamesSubject.next({});
  }

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
}
