import { Recipe, Category, SearchResult, EditorTab } from '../models/recipe.model';
import { IOProgress } from '../services/io.types';

export interface DataState {
  recipes: Recipe[];
  categories: Category[];
  searchQuery: string;
  searchResults: SearchResult[];
  filteredRecipes: Recipe[];
  searchIsActive: boolean;
  searchHasResults: boolean;
  searchOverlayOpen: boolean;
  isLoadingRecipes: boolean;
  recipesLoadError: string | null;
}

export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  isImporting: boolean;
  importProgress: IOProgress | null;
  validationErrors: Record<string, string[]>;
}

export interface UIState {
  currentView: 'home' | 'category' | 'recipe' | 'editor';
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  isMobile: boolean;
  tocHidden: boolean;
  activeSectionId: string;
  userHasScrolled: boolean;
  showLoadingOverlay: boolean;
}

export interface StoreState {
  data: DataState;
  editor: EditorState;
  ui: UIState;
}
