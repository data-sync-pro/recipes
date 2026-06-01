import { Injectable } from '@angular/core';
import { RecipeData } from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';
import { LocalStorageService } from '../../core/services/local-storage.service';
import { cleanRecipeForStorage } from '../../core/utils';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly STORAGE_KEY_PREFIX = 'recipe_editor_';
  private readonly EDITED_RECIPES_KEY = this.STORAGE_KEY_PREFIX + 'edited_recipes';
  private readonly EDITED_IDS_KEY = this.STORAGE_KEY_PREFIX + 'edited_ids';
  private readonly ACTIVE_STATES_KEY = this.STORAGE_KEY_PREFIX + 'active_states';

  constructor(
    private logger: LoggerService,
    private storage: LocalStorageService
  ) {}

  saveRecipe(recipe: RecipeData): boolean {
    try {
      if (!recipe.id) {
        this.logger.error('Recipe must have an ID to be saved');
        return false;
      }

      const cleanedRecipe = cleanRecipeForStorage(recipe);
      const editedRecipes = this.getAllEditedRecipes();

      const existingIndex = editedRecipes.findIndex(r => r.id === cleanedRecipe.id);
      if (existingIndex >= 0) {
        editedRecipes[existingIndex] = cleanedRecipe;
      } else {
        editedRecipes.push(cleanedRecipe);
      }

      this.storage.setItem(this.EDITED_RECIPES_KEY, editedRecipes);
      this.updateEditedIds(editedRecipes);
      
      return true;
    } catch (error) {
      this.logger.error('Error saving recipe:', error);
      return false;
    }
  }

  getAllEditedRecipes(): RecipeData[] {
    return this.storage.getItem<RecipeData[]>(this.EDITED_RECIPES_KEY, []) || [];
  }

  getEditedRecipeIds(): string[] {
    return this.storage.getItem<string[]>(this.EDITED_IDS_KEY, []) || [];
  }

  getEditedRecipe(recipeId: string): RecipeData | null {
    try {
      const editedRecipes = this.getAllEditedRecipes();
      return editedRecipes.find(r => r.id === recipeId) || null;
    } catch (error) {
      this.logger.error('Error getting edited recipe:', error);
      return null;
    }
  }

  private updateEditedIds(recipes: RecipeData[]): void {
    const ids = recipes.map(r => r.id).filter(id => id);
    this.storage.setItem(this.EDITED_IDS_KEY, ids);
  }

  private deleteEditedRecipe(recipeId: string): boolean {
    try {
      const editedRecipes = this.getAllEditedRecipes();
      const filteredRecipes = editedRecipes.filter(r => r.id !== recipeId);

      if (filteredRecipes.length === editedRecipes.length) {
        return false;
      }

      this.storage.setItem(this.EDITED_RECIPES_KEY, filteredRecipes);
      this.updateEditedIds(filteredRecipes);

      return true;
    } catch (error) {
      this.logger.error('Error deleting edited recipe:', error);
      return false;
    }
  }

  clearRecipe(recipeId: string): boolean {
    return this.deleteEditedRecipe(recipeId);
  }

  saveRecipeActiveState(recipeId: string, isActive: boolean): void {
    try {
      const activeStates = this.getAllActiveStates();
      activeStates[recipeId] = isActive;
      this.storage.setItem(this.ACTIVE_STATES_KEY, activeStates);
    } catch (error) {
      this.logger.error('Error saving recipe active state:', error);
    }
  }

  getAllActiveStates(): { [recipeId: string]: boolean } {
    return this.storage.getItem<{ [recipeId: string]: boolean }>(this.ACTIVE_STATES_KEY, {}) || {};
  }

  clearAllActiveStates(): void {
    try {
      this.storage.setItem(this.ACTIVE_STATES_KEY, {});
    } catch (error) {
      this.logger.error('Error clearing all active states:', error);
    }
  }

}