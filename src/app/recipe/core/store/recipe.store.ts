import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, map, distinctUntilChanged } from 'rxjs';
import {
  StoreState,
  DataState,
  EditorState,
  UIState
} from './store.interface';
import { Recipe, EditorTab } from '../models/recipe.model';
import { LoggerService } from '../services/logger.service';
import { RECIPE_SECTIONS } from '../constants/recipe.constants';


@Injectable({
  providedIn: 'root'
})
export class Store implements OnDestroy {
  private readonly initialState: StoreState = {
    data: {
      recipes: [],
      categories: [],
      searchQuery: '',
      searchResults: [],
      filteredRecipes: [],
      searchIsActive: false,
      searchHasResults: true,
      searchOverlayOpen: false,
      isLoadingRecipes: false,
      recipesLoadError: null
    },
    editor: {
      tabs: [],
      activeTabId: null,
      isLoading: false,
      isSaving: false,
      lastSaved: null,
      isImporting: false,
      importProgress: null,
      validationErrors: {}
    },
    ui: {
      currentView: 'home',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      isMobile: false,
      tocHidden: false,
      activeSectionId: RECIPE_SECTIONS.RECIPE_OVERVIEW,
      userHasScrolled: false,
      showLoadingOverlay: false
    }
  };

  private readonly stateSubject = new BehaviorSubject<StoreState>(this.initialState);

  public readonly state$: Observable<StoreState> = this.stateSubject.asObservable();

  public readonly data$: Observable<DataState> = this.state$.pipe(
    map(state => state.data),
    distinctUntilChanged()
  );

  public readonly editor$: Observable<EditorState> = this.state$.pipe(
    map(state => state.editor),
    distinctUntilChanged()
  );

  public readonly ui$: Observable<UIState> = this.state$.pipe(
    map(state => state.ui),
    distinctUntilChanged()
  );

  private resizeHandler: (() => void) | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private logger: LoggerService) {
    this.logger.debug('Store initialized');

    this.loadUIPreferences();

    this.setupViewportListener();
  }

  private getState(): StoreState {
    return this.stateSubject.value;
  }

  getEditorState(): EditorState {
    return this.stateSubject.value.editor;
  }

  getUIState(): UIState {
    return this.stateSubject.value.ui;
  }

  updateDataState(update: Partial<DataState>): void {
    const currentState = this.getState();
    const newState: StoreState = {
      ...currentState,
      data: { ...currentState.data, ...update }
    };
    this.stateSubject.next(newState);
  }

  private updateEditorState(update: Partial<EditorState>): void {
    const currentState = this.getState();
    const newState: StoreState = {
      ...currentState,
      editor: { ...currentState.editor, ...update }
    };
    this.stateSubject.next(newState);
  }

  updateUIState(update: Partial<UIState>): void {
    const currentState = this.getState();
    const newState: StoreState = {
      ...currentState,
      ui: { ...currentState.ui, ...update }
    };
    this.stateSubject.next(newState);
  }

  setRecipes(recipes: Recipe[]): void {
    this.updateDataState({ recipes });
  }

  setLoadingRecipes(isLoading: boolean): void {
    this.updateDataState({ isLoadingRecipes: isLoading });
  }

  setRecipesLoadError(error: string | null): void {
    this.updateDataState({ recipesLoadError: error });
  }

  openSearchOverlay(): void {
    this.updateDataState({ searchOverlayOpen: true });
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  }

  closeSearchOverlay(): void {
    this.updateDataState({ searchOverlayOpen: false });
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  clearSearch(): void {
    this.updateDataState({
      searchQuery: '',
      searchResults: [],
      searchIsActive: false,
      searchHasResults: true
    });
  }

  addEditorTab(tab: EditorTab): void {
    const currentTabs = this.getEditorState().tabs;
    currentTabs.forEach(t => t.isActive = false);
    const newTabs = [...currentTabs, tab];
    this.updateEditorState({
      tabs: newTabs,
      activeTabId: tab.id
    });
    this.logger.debug('Editor tab added', { tabId: tab.id, title: tab.title });
  }

  removeEditorTab(tabId: string): number {
    const currentTabs = this.getEditorState().tabs;
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (tabIndex === -1) {
      this.logger.warn('Attempted to remove non-existent tab', { tabId });
      return -1;
    }

    const newTabs = currentTabs.filter(t => t.id !== tabId);
    this.updateEditorState({ tabs: newTabs });
    this.logger.debug('Editor tab removed', { tabId });
    return tabIndex;
  }

  updateEditorTab(tabId: string, updates: Partial<EditorTab>): void {
    const currentTabs = this.getEditorState().tabs;
    const tab = currentTabs.find(t => t.id === tabId);

    if (!tab) {
      this.logger.warn('Attempted to update non-existent tab', { tabId });
      return;
    }

    Object.assign(tab, updates);
    this.updateEditorState({ tabs: [...currentTabs] });
  }

  selectEditorTab(tabId: string): boolean {
    const currentTabs = this.getEditorState().tabs;
    const tab = currentTabs.find(t => t.id === tabId);

    if (!tab) {
      this.logger.warn('Attempted to select non-existent tab', { tabId });
      return false;
    }

    currentTabs.forEach(t => t.isActive = false);
    tab.isActive = true;
    this.updateEditorState({
      tabs: [...currentTabs],
      activeTabId: tabId
    });
    this.logger.debug('Editor tab selected', { tabId, title: tab.title });
    return true;
  }

  setEditorImporting(isImporting: boolean, progress: EditorState['importProgress'] = null): void {
    this.updateEditorState({ isImporting, importProgress: progress });
  }

  setCurrentView(view: 'home' | 'category' | 'recipe' | 'editor'): void {
    this.updateUIState({ currentView: view });
  }

  toggleSidebar(): void {
    const currentState = this.getUIState();
    this.setSidebarCollapsed(!currentState.sidebarCollapsed);
  }

  private setSidebarCollapsed(collapsed: boolean): void {
    this.updateUIState({ sidebarCollapsed: collapsed });
    this.saveUIPreferences();
  }

  toggleMobileSidebar(): void {
    const currentState = this.getUIState();
    this.updateUIState({ mobileSidebarOpen: !currentState.mobileSidebarOpen });
  }

  closeMobileSidebar(): void {
    this.updateUIState({ mobileSidebarOpen: false });
  }

  setActiveSectionId(sectionId: string): void {
    this.updateUIState({ activeSectionId: sectionId });
  }

  markUserScrolled(): void {
    this.updateUIState({ userHasScrolled: true });
  }

  setLoadingOverlay(show: boolean): void {
    this.updateUIState({ showLoadingOverlay: show });
  }

  getActiveEditorTab(): EditorTab | undefined {
    const editorState = this.getEditorState();
    return editorState.tabs.find(t => t.id === editorState.activeTabId);
  }

  hasUnsavedChanges(): boolean {
    return this.getEditorState().tabs.some(t => t.hasChanges);
  }

  selectActiveTab(): Observable<EditorTab | undefined> {
    return this.editor$.pipe(
      map(editor => editor.tabs.find(t => t.id === editor.activeTabId)),
      distinctUntilChanged()
    );
  }

  private loadUIPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem('recipe-ui-state');
      if (stored) {
        const preferences = JSON.parse(stored);
        if (preferences.sidebarCollapsed !== undefined) {
          this.updateUIState({ sidebarCollapsed: preferences.sidebarCollapsed });
        }
      }
    } catch (error) {
      this.logger.error('Failed to load UI preferences from localStorage', error);
    }
  }

  private saveUIPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const uiState = this.getUIState();
      const preferences = {
        sidebarCollapsed: uiState.sidebarCollapsed
      };
      localStorage.setItem('recipe-ui-state', JSON.stringify(preferences));
    } catch (error) {
      this.logger.error('Failed to save UI preferences to localStorage', error);
    }
  }

  private setupViewportListener(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.checkMobileView();


    this.resizeHandler = () => {
      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
      }

      this.resizeTimer = setTimeout(() => {
        this.checkMobileView();
      }, 150);
    };

    window.addEventListener('resize', this.resizeHandler);
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (this.resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  }


  private checkMobileView(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const isMobile = window.innerWidth <= 768;
    const currentMobile = this.getUIState().isMobile;

    if (isMobile !== currentMobile) {
      this.updateUIState({ isMobile });
    }
  }
}
