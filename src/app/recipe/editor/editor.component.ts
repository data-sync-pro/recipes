import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, ChangeDetectorRef } from '@angular/core';
import { Subject, takeUntil, map } from 'rxjs';
import { LoggerService } from '../core/services/logger.service';
import { NotificationService } from '../../shared/services/notification.service';
import { ClipboardUtil } from '../../shared/utils/clipboard.util';
import { Store } from '../core/store/recipe.store';
import { EditorState } from '../core/store/store.interface';
import { ListManagementService, RecipeTitleItem } from './services/list-management.service';
import { StepManagementService } from './services/step-management.service';
import { IOCoordinatorService } from './services/io-coordinator.service';
import { PreviewCoordinatorService } from './services/preview-coordinator.service';
import { ChangeCoordinatorService } from './services/change-coordinator.service';
import { FieldSuggestionService } from './services/field-suggestion.service';
import { ImageManagementService } from './services/image-management.service';
import { EditorUtils } from './utils/editor.utils';
import { TrackByUtil } from '../../shared/utils/trackby.util';
import { EDITOR_CONSTANTS } from './editor.constants';
import {
  Recipe,
  RecipeData,
  EditorTab,
  normalizeCategory
} from '../core/models/recipe.model';
import { IOProgress } from '../core/services/io.types';

@Component({
  selector: 'app-recipe-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class RecipeEditorComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;

  private destroy$ = new Subject<void>();

  recipeList: Recipe[] = [];
  filteredRecipes: Recipe[] = [];
  editedRecipeIds = new Set<string>();
  state!: EditorState;
  currentRecipe: RecipeData | null = null;
  currentIsActive = true;

  protected readonly Math = Math;

  searchQuery = '';
  selectedCategory = '';
  categories = ['Batch', 'Trigger', 'Data List', 'Action Button', 'Data Loader', 'General', 'Transformation', 'Query'];

  expandedSteps: Set<number> = new Set();
  customStepNames: { [index: number]: string } = {};

  showTooltip: string | null = null;
  private tooltipHideTimeout: any;

  jsonPreview = '';

  stepOptions = [
    'Action',
    'Action Button Settings',
    'Batch Settings',
    'Create Executable',
    'Create Pipeline',
    'Create Scheduler',
    'Data List Settings',
    'Data Loader Settings',
    'Input',
    'Mapping',
    'Match',
    'Preview',
    'Preview Transformed',
    'Retrieve',
    'Scoping',
    'Trigger Settings',
    'Variable',
    'Verify',
    'Custom'
  ];

  trackByIndex = TrackByUtil.index;
  trackById = TrackByUtil.id;

  // Get first category for components that expect a single string
  get currentRecipeFirstCategory(): string {
    if (!this.currentRecipe?.category) return '';
    const categories = normalizeCategory(this.currentRecipe.category);
    return categories[0] || '';
  }

  private previousTitle: string = '';

  constructor(
    private store: Store,
    private listManagementService: ListManagementService,
    private stepManagementService: StepManagementService,
    private ioCoordinatorService: IOCoordinatorService,
    private previewCoordinatorService: PreviewCoordinatorService,
    private changeCoordinatorService: ChangeCoordinatorService,
    private fieldSuggestionService: FieldSuggestionService,
    private imageManagementService: ImageManagementService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
  ) {
    this.state = this.store.getEditorState();
  }

  ngOnInit(): void {
    this.subscribeToState();
    this.listManagementService.loadRecipes();
    // Don't create a new tab immediately - wait for recipes to load
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.hasUnsavedChanges()) {
      this.ioCoordinatorService.saveMultipleRecipes(
        this.store.getEditorState().tabs
          .filter(tab => tab.hasChanges && tab.recipe)
          .map(tab => tab.recipe!),
        this.customStepNames
      );
    }

    this.changeCoordinatorService.cancelScheduledUpdates();
    EditorUtils.clearTimeoutSafely(this.tooltipHideTimeout);
  }

  private subscribeToState(): void {
    this.listManagementService.recipes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(recipes => {
        this.recipeList = recipes;

        // Auto-load first recipe on initial load
        if (recipes.length > 0 && this.state.tabs.length === 0) {
          const firstRecipe = recipes[0];
          this.logger.debug('Auto-loading first recipe', { recipeId: firstRecipe.id });
          this.loadRecipeToEditor(firstRecipe);
        }

        this.cdr.markForCheck();
      });

    this.listManagementService.filteredRecipes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(recipes => {
        this.filteredRecipes = recipes;
        this.cdr.markForCheck();
      });

    this.store.editor$.pipe(map(e => e.tabs))
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.state = this.store.getEditorState();
        this.cdr.markForCheck();
      });

    this.store.selectActiveTab().pipe(map(tab => tab?.recipe || null))
      .pipe(takeUntil(this.destroy$))
      .subscribe(recipe => {
        this.currentRecipe = recipe;
        if (recipe) {
          this.updateJsonPreview();
          this.initializeExpandedSteps();
        }
        this.cdr.markForCheck();
      });

    this.stepManagementService.expandedSteps$
      .pipe(takeUntil(this.destroy$))
      .subscribe(steps => {
        this.expandedSteps = steps;
        this.cdr.markForCheck();
      });

    this.stepManagementService.customStepNames$
      .pipe(takeUntil(this.destroy$))
      .subscribe(names => {
        this.customStepNames = names;
        this.cdr.markForCheck();
      });

    this.listManagementService.editedRecipeIds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ids => {
        this.editedRecipeIds = ids;
        this.cdr.markForCheck();
      });
  }


  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveCurrentTab();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
      event.preventDefault();
      this.createNewTab();
    }
  }

  createNewTab(): void {
    const newRecipe = EditorUtils.createEmptyRecipe();
    const newTab: EditorTab = {
      id: EditorUtils.generateUUID(),
      title: newRecipe.title,
      recipe: newRecipe,
      hasChanges: false,
      isActive: true
    };

    this.store.addEditorTab(newTab);
    this.currentRecipe = newRecipe;
    this.previousTitle = newRecipe.title;

    // Switch to this recipe's customStepNames (empty for new recipe)
    this.stepManagementService.setCurrentRecipe(newRecipe.id);

    this.logger.debug('New tab created', { tabId: newTab.id });
  }

  selectTab(tabId: string): void {
    const success = this.store.selectEditorTab(tabId);
    if (success) {
      const tab = this.store.getEditorState().tabs.find(t => t.id === tabId);
      if (tab?.recipe) {
        this.currentRecipe = tab.recipe;
        this.previousTitle = tab.recipe.title;

        // Switch to this recipe's customStepNames
        this.stepManagementService.setCurrentRecipe(tab.recipe.id);

        this.currentIsActive = this.listManagementService.isRecipeActive(tab.recipe.id);

        this.cdr.markForCheck();
      }
    }
  }

  closeTab(tabId: string): void {
    const tab = this.store.getEditorState().tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.hasChanges) {
      const confirmed = confirm(
        `"${tab.title}" has unsaved changes. Close anyway?`
      );
      if (!confirmed) return;
    }

    const tabIndex = this.store.removeEditorTab(tabId);
    if (tabIndex === -1) return;

    const tabs = this.store.getEditorState().tabs;
    if (tabs.length > 0 && tab.isActive) {
      const newIndex = Math.min(tabIndex, tabs.length - 1);
      this.selectTab(tabs[newIndex].id);
    } else if (tabs.length === 0) {
      this.createNewTab();
    }
  }


  loadRecipeToEditor(recipe: Recipe): void {
    this.logger.debug('Loading recipe to editor', { recipeId: recipe.id });

    const existingTab = this.state.tabs.find(t => t.recipe?.id === recipe.id);
    if (existingTab) {
      this.selectTab(existingTab.id);
      this.notificationService.info(`"${recipe.title}" is already open`);
      return;
    }

    if (this.state.tabs.length >= EDITOR_CONSTANTS.MAX_TABS) {
      this.notificationService.warning(
        `Maximum ${EDITOR_CONSTANTS.MAX_TABS} tabs allowed. Please close some tabs first.`
      );
      return;
    }

    // Try to load edited version from storage first
    const editedRecipe = this.ioCoordinatorService.getEditedRecipe(recipe.id);
    const sourceRecipe = editedRecipe || EditorUtils.convertToSourceRecord(recipe);

    if (editedRecipe) {
      this.logger.debug('Loading edited version of recipe from storage', { recipeId: recipe.id });
    }

    const newTab: EditorTab = {
      id: EditorUtils.generateUUID(),
      title: sourceRecipe.title,
      recipe: sourceRecipe,
      hasChanges: false,
      isActive: true
    };

    this.store.addEditorTab(newTab);
    this.currentRecipe = sourceRecipe;
    this.previousTitle = sourceRecipe.title;
    this.currentIsActive = this.listManagementService.isRecipeActive(recipe.id);

    // Switch to this recipe's customStepNames
    this.stepManagementService.setCurrentRecipe(sourceRecipe.id);
  }


  filterRecipes(): void {
    this.listManagementService.filterRecipes(this.searchQuery, this.selectedCategory);
  }


  isRecipeEdited(recipeId: string): boolean {
    return this.listManagementService.isRecipeEdited(recipeId);
  }

  isRecipeActive(recipeId: string): boolean {
    return this.listManagementService.isRecipeActive(recipeId);
  }

  onActiveStatusChange(isActive: boolean): void {
    this.currentIsActive = isActive;

    if (this.currentRecipe?.id) {
      this.listManagementService.setRecipeActiveState(this.currentRecipe.id, isActive);
    }

    this.onRecipeChange();
  }


  onRecipeChange(): void {
    const tab = this.getCurrentTab();
    if (!tab || !this.currentRecipe) return;

    const result = this.changeCoordinatorService.onRecipeChange(
      this.currentRecipe,
      tab,
      this.previousTitle
    );

    if (result.titleChanged && this.currentRecipe) {
      this.previousTitle = this.currentRecipe.title;
      this.store.updateEditorTab(tab.id, { title: this.currentRecipe.title });
    }

    if (this.currentRecipe) {
      this.previewCoordinatorService.triggerPreviewUpdate(
        this.currentRecipe,
        this.customStepNames
      );
      this.updateJsonPreview();
    }
  }


  addStep(): void {
    if (!this.currentRecipe) return;

    const added = this.stepManagementService.addStep(this.currentRecipe);
    if (added) {
      const newStepIndex = this.currentRecipe.walkthrough.length - 1;
      this.stepManagementService.expandStep(newStepIndex);

      this.onRecipeChange();
    }
  }

  removeStep(index: number): void {
    if (!this.currentRecipe) return;

    const removed = this.stepManagementService.removeStep(this.currentRecipe, index);
    if (removed) {
      const steps = this.currentRecipe.walkthrough;
      this.stepManagementService.reindexCustomStepNames(steps);

      this.onRecipeChange();
    }
  }

  moveStepUp(index: number): void {
    if (!this.currentRecipe) return;

    const moved = this.stepManagementService.moveStepUp(this.currentRecipe, index);
    if (moved) {
      this.onRecipeChange();
    }
  }

  moveStepDown(index: number): void {
    if (!this.currentRecipe) return;

    const moved = this.stepManagementService.moveStepDown(this.currentRecipe, index);
    if (moved) {
      this.onRecipeChange();
    }
  }


  addConfig(stepIndex: number): void {
    if (!this.currentRecipe) return;

    const added = this.stepManagementService.addConfig(this.currentRecipe, stepIndex);
    if (added) {
      this.onRecipeChange();
    }
  }

  removeConfig(stepIndex: number, configIndex: number): void {
    if (!this.currentRecipe) return;

    const removed = this.stepManagementService.removeConfig(
      this.currentRecipe,
      stepIndex,
      configIndex
    );
    if (removed) {
      this.onRecipeChange();
    }
  }


  addMedia(stepIndex: number): void {
    if (!this.currentRecipe) return;

    const added = this.stepManagementService.addMedia(this.currentRecipe, stepIndex);
    if (added) {
      this.onRecipeChange();
    }
  }

  async onImageDrop(event: DragEvent, stepIndex: number): Promise<void> {
    if (!this.currentRecipe) return;

    await this.imageManagementService.handleStepImageDrop(
      event,
      this.currentRecipe,
      stepIndex,
      () => this.onRecipeChange()
    );
  }

  async handleImageFile(file: File, stepIndex: number): Promise<void> {
    if (!this.currentRecipe) return;

    await this.imageManagementService.uploadImage(
      file,
      this.currentRecipe,
      'step-media',
      { stepIndex },
      () => this.onRecipeChange()
    );
  }

  removeMedia(stepIndex: number, mediaIndex: number): void {
    if (!this.currentRecipe) return;

    const step = this.currentRecipe.walkthrough[stepIndex];
    if (step?.media && mediaIndex >= 0 && mediaIndex < step.media.length) {
      step.media.splice(mediaIndex, 1);
      this.onRecipeChange();
    }
  }


  addGeneralImage(): void {
    if (!this.currentRecipe) return;
    this.imageManagementService.addEmptyGeneralImage(
      this.currentRecipe,
      () => this.onRecipeChange()
    );
  }

  async handleGeneralImageFile(file: File): Promise<void> {
    if (!this.currentRecipe) return;

    await this.imageManagementService.uploadImage(
      file,
      this.currentRecipe,
      'general-image',
      {},
      () => this.onRecipeChange()
    );
  }

  removeGeneralImage(index: number): void {
    if (!this.currentRecipe) return;

    if (this.currentRecipe.generalImages && index >= 0 && index < this.currentRecipe.generalImages.length) {
      this.currentRecipe.generalImages.splice(index, 1);
      this.onRecipeChange();
    }
  }

  async onGeneralImageDrop(event: DragEvent): Promise<void> {
    if (!this.currentRecipe) return;

    await this.imageManagementService.handleGeneralImageDrop(
      event,
      this.currentRecipe,
      () => this.onRecipeChange()
    );
  }


  public handleMissingImage(media: any, stepIndex: number): void {
    if (media) {
      media.isMissing = true;
    }
  }

  public handleMissingGeneralImage(image: any, imageIndex: number): void {
    if (image) {
      image.isMissing = true;
    }
  }

  public async replaceMissingImage(event: Event, media: any, stepIndex: number): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file || !this.currentRecipe) return;

    await this.imageManagementService.uploadImage(
      file,
      this.currentRecipe,
      'replace-step-media',
      { existingObject: media, stepIndex, targetInput: target },
      () => this.onRecipeChange()
    );

    target.value = '';
  }

  public async replaceMissingGeneralImage(event: Event, image: any, imageIndex: number): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file || !this.currentRecipe) return;

    await this.imageManagementService.uploadImage(
      file,
      this.currentRecipe,
      'replace-general-image',
      { existingObject: image, targetInput: target },
      () => this.onRecipeChange()
    );

    target.value = '';
  }


  toggleStep(index: number): void {
    this.stepManagementService.toggleStep(index);
  }

  isStepExpanded(index: number): boolean {
    return this.stepManagementService.isStepExpanded(index);
  }

  getStepTitle(step: any, index: number): string {
    return this.stepManagementService.getStepTitle(step, index);
  }

  private initializeExpandedSteps(): void {
    if (!this.currentRecipe?.walkthrough) return;

    this.stepManagementService.initializeExpandedSteps(this.currentRecipe);
  }

  onStepSelectionChange(step: any, index: number): void {
    this.stepManagementService.onStepSelectionChange(step, index);
    this.onRecipeChange();
  }

  onCustomStepNameChange(index: number): void {
    const customName = this.customStepNames[index] || '';
    this.stepManagementService.onCustomStepNameChange(index, customName);
    this.onRecipeChange();
  }

  isCustomStep(step: any): boolean {
    return this.stepManagementService.isCustomStep(step);
  }


  public onAutocompleteSelect(value: string, stepIndex: number, configIndex: number): void {
    if (this.currentRecipe?.walkthrough?.[stepIndex]?.config?.[configIndex]) {
      this.currentRecipe.walkthrough[stepIndex].config[configIndex].field = value;
      this.onRecipeChange();
      this.cdr.markForCheck();
    }
  }

  getFieldSuggestions(stepType: string): string[] {
    return this.fieldSuggestionService.getFieldSuggestions(stepType);
  }


  async copyToClipboard(text: string): Promise<void> {
    try {
      await ClipboardUtil.copyToClipboard(text);
      this.notificationService.success('Copied to clipboard!');
    } catch (error) {
      this.logger.error('Failed to copy to clipboard', error);
      this.notificationService.error('Failed to copy to clipboard');
    }
  }


  saveCurrentTab(isAutoSave = false): void {
    const tab = this.getCurrentTab();
    if (!tab || !this.currentRecipe) return;

    const result = this.ioCoordinatorService.saveRecipe(
      this.currentRecipe,
      this.customStepNames
    );

    if (result.success) {
      this.store.updateEditorTab(tab.id, { hasChanges: false });
      // Reload edited recipes to update the editedRecipeIds
      this.listManagementService.loadEditedRecipes();
      if (!isAutoSave) {
        this.logger.info('Recipe saved manually', { recipeId: this.currentRecipe.id });
      }
    }
  }

  saveAllTabs(): void {
    const tabs = this.store.getEditorState().tabs
      .filter(tab => tab.hasChanges && tab.recipe);

    if (tabs.length === 0) {
      this.notificationService.info('No unsaved changes to save.');
      return;
    }

    const recipes = tabs.map(tab => tab.recipe!);
    const results = this.ioCoordinatorService.saveMultipleRecipes(
      recipes,
      this.customStepNames
    );

    results.forEach((result, index) => {
      if (result.success) {
        this.store.updateEditorTab(tabs[index].id, { hasChanges: false });
      }
    });

    // Reload edited recipes to update the editedRecipeIds
    this.listManagementService.loadEditedRecipes();
  }

  async exportEditedAndNewRecipes(): Promise<void> {
    try {
      const editedRecipes = this.listManagementService.getFilteredEditedRecipes();
      const recipeActiveStates = this.listManagementService.getAllRecipeActiveStates();

      await this.ioCoordinatorService.exportEditedRecipes(
        editedRecipes,
        this.recipeList,
        (progress) => this.updateImportProgress(progress),
        recipeActiveStates
      );
    } finally {
      // Always reset the importing state when done
      this.store.setEditorImporting(false);
    }
  }

  async exportAllRecipes(): Promise<void> {
    try {
      // Get edited recipes from storage to include any modifications (like uploaded executables)
      const editedRecipes = this.listManagementService.getFilteredEditedRecipes();
      const recipeActiveStates = this.listManagementService.getAllRecipeActiveStates();

      await this.ioCoordinatorService.exportAllRecipes(
        editedRecipes,
        this.recipeList,
        (progress) => this.updateImportProgress(progress),
        recipeActiveStates
      );
    } finally {
      // Always reset the importing state when done
      this.store.setEditorImporting(false);
    }
  }

  triggerImport(): void {
    this.fileInput.nativeElement.click();
  }

  async importRecipe(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const result = await this.ioCoordinatorService.importFromFile(file);

    if (result.success && result.recipe) {
      this.listManagementService.loadRecipes();
    }

    target.value = '';
  }

  clearAllData(): void {
    const editedCount = this.listManagementService.getTotalEditedCount();
    if (editedCount === 0) {
      this.notificationService.info('No edited data to clear.');
      return;
    }

    const confirmed = confirm(
      `This will permanently delete all ${editedCount} edited recipe(s). Continue?`
    );

    if (confirmed) {
      this.ioCoordinatorService.clearAllData();

      // Clear all customStepNames
      this.stepManagementService.clearAllCustomStepNames();

      const tabs = this.store.getEditorState().tabs;
      tabs.forEach(tab => this.store.removeEditorTab(tab.id));
      this.createNewTab();

      this.listManagementService.loadRecipes();
      // Reload edited recipes to update the editedRecipeIds (should be empty now)
      this.listManagementService.loadEditedRecipes();
    }
  }

  private updateImportProgress(progress: IOProgress): void {
    this.store.setEditorImporting(true, progress);
  }


  openPreviewInNewTab(): void {
    if (!this.currentRecipe) return;

    this.previewCoordinatorService.openPreviewInNewTab(
      this.currentRecipe,
      this.customStepNames
    );
  }

  private updateJsonPreview(): void {
    if (!this.currentRecipe) {
      this.jsonPreview = '';
      return;
    }

    this.jsonPreview = this.previewCoordinatorService.generateJsonPreview(
      this.currentRecipe,
      this.customStepNames
    );
  }


  hasUnsavedChanges(): boolean {
    return this.store.hasUnsavedChanges();
  }

  getCreatedCount(): number {
    return this.listManagementService.getCreatedCount();
  }

  getEditedExistingCount(): number {
    return this.listManagementService.getEditedExistingCount();
  }

  getCreatedRecipeTitles(): RecipeTitleItem[] {
    return this.listManagementService.getCreatedRecipeTitles(
      EDITOR_CONSTANTS.TITLE_MAX_LENGTH_TOOLTIP,
      EDITOR_CONSTANTS.MAX_TOOLTIP_ITEMS
    );
  }

  getEditedExistingRecipeTitles(): RecipeTitleItem[] {
    return this.listManagementService.getEditedExistingRecipeTitles(
      EDITOR_CONSTANTS.TITLE_MAX_LENGTH_TOOLTIP,
      EDITOR_CONSTANTS.MAX_TOOLTIP_ITEMS
    );
  }

  getEditedRecipeTitles(): RecipeTitleItem[] {
    return this.listManagementService.getEditedRecipeTitles(
      EDITOR_CONSTANTS.TITLE_MAX_LENGTH_TOOLTIP,
      EDITOR_CONSTANTS.MAX_TOOLTIP_ITEMS
    );
  }


  onTooltipEnter(type: string): void {
    EditorUtils.clearTimeoutSafely(this.tooltipHideTimeout);
    this.showTooltip = type;
  }

  onTooltipLeave(): void {
    this.tooltipHideTimeout = setTimeout(() => {
      this.showTooltip = null;
      this.cdr.markForCheck();
    }, 200);
  }

  onTooltipRecipeClick(recipeId: string): void {
    this.showTooltip = null;
    const recipe = this.recipeList.find(r => r.id === recipeId);
    if (recipe) {
      this.loadRecipeToEditor(recipe);
    }
  }


  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    this.logger.warn('Failed to load image:', img.src);
  }


  private getCurrentTab(): EditorTab | undefined {
    return this.store.getActiveEditorTab();
  }
}
