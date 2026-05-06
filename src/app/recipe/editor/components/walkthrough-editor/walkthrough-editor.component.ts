import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChildren,
  QueryList,
  ElementRef
} from '@angular/core';
import {
  WalkthroughStep,
  WalkthroughTab,
  StepConfig
} from '../../../core/models/recipe.model';
import { FieldSuggestionService } from '../../services/field-suggestion.service';
import { TrackByUtil } from '../../../../shared/utils/trackby.util';
import { CustomStepNames } from '../../services/step-management.service';

/**
 * Walkthrough Editor Component
 *
 * Edits a tab-grouped walkthrough: each tab contains an ordered list of steps.
 * The active tab determines which step list is shown; step add/remove/reorder
 * always operate on the active tab's steps.
 */
@Component({
  selector: 'app-walkthrough-editor',
  templateUrl: './walkthrough-editor.component.html',
  styleUrls: ['./walkthrough-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WalkthroughEditorComponent {
  @Input() walkthrough: WalkthroughTab[] = [];
  @Input() stepOptions: string[] = [];
  @Input() expandedSteps: Set<string> = new Set();
  @Input() customStepNames: CustomStepNames = {};
  @Input() recipeId: string = '';
  @Input() recipeCategory: string = '';

  @Output() walkthroughChange = new EventEmitter<void>();
  @Output() stepExpansionToggle = new EventEmitter<{ tabIndex: number; stepIndex: number }>();
  @Output() addTab = new EventEmitter<void>();
  @Output() removeTab = new EventEmitter<number>();
  @Output() moveTabUp = new EventEmitter<number>();
  @Output() moveTabDown = new EventEmitter<number>();

  activeTabIndex: number = 0;
  // Index of the tab whose name is being edited inline; null when no tab is in edit mode.
  editingTabIndex: number | null = null;

  @ViewChildren('tabNameInput') tabNameInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fieldSuggestionService: FieldSuggestionService,
    private cdr: ChangeDetectorRef
  ) {}

  // ==================== Tab UI ====================

  setActiveTab(index: number): void {
    if (index < 0 || index >= this.walkthrough.length) return;
    // Switching tabs while editing → exit edit mode (don't carry editing across tabs)
    if (this.editingTabIndex !== null && this.editingTabIndex !== index) {
      this.editingTabIndex = null;
    }
    this.activeTabIndex = index;
    this.cdr.markForCheck();
  }

  get activeTab(): WalkthroughTab | null {
    return this.walkthrough[this.activeTabIndex] || null;
  }

  /** Get a display label, falling back to "Tab N" when the user has not named it. */
  tabDisplayName(tab: WalkthroughTab, index: number): string {
    return (tab.tab && tab.tab.trim()) || `Tab ${index + 1}`;
  }

  startEditingTab(index: number, event?: Event): void {
    event?.stopPropagation();
    this.activeTabIndex = index;
    this.editingTabIndex = index;
    this.cdr.markForCheck();
    // Focus the input on next tick after *ngIf renders it
    setTimeout(() => {
      const input = this.tabNameInputs.first?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  finishEditingTab(): void {
    if (this.editingTabIndex === null) return;
    this.editingTabIndex = null;
    this.cdr.markForCheck();
    this.onChange();
  }

  onTabNameKeydown(event: KeyboardEvent): void {
    // Enter commits, Escape cancels (without losing the typed value)
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }

  onTabNameInput(): void {
    // Live-update so the JSON preview / save state reflects edits as they happen
    this.onChange();
  }

  onAddTab(): void {
    this.addTab.emit();
    // After parent has appended the tab, jump to it and enter edit mode so the
    // user can name it immediately without an extra click.
    setTimeout(() => {
      const newIndex = Math.max(0, this.walkthrough.length - 1);
      this.startEditingTab(newIndex);
    });
  }

  onRemoveTab(tabIndex: number, event: Event): void {
    event.stopPropagation();
    if (this.walkthrough.length <= 1) return;
    this.removeTab.emit(tabIndex);
    this.editingTabIndex = null;
    if (this.activeTabIndex >= this.walkthrough.length - 1) {
      this.activeTabIndex = Math.max(0, this.walkthrough.length - 2);
    }
    this.cdr.markForCheck();
  }

  onMoveTabUp(tabIndex: number, event: Event): void {
    event.stopPropagation();
    this.moveTabUp.emit(tabIndex);
    this.editingTabIndex = null;
    if (this.activeTabIndex === tabIndex) this.activeTabIndex = tabIndex - 1;
    else if (this.activeTabIndex === tabIndex - 1) this.activeTabIndex = tabIndex;
    this.cdr.markForCheck();
  }

  onMoveTabDown(tabIndex: number, event: Event): void {
    event.stopPropagation();
    this.moveTabDown.emit(tabIndex);
    this.editingTabIndex = null;
    if (this.activeTabIndex === tabIndex) this.activeTabIndex = tabIndex + 1;
    else if (this.activeTabIndex === tabIndex + 1) this.activeTabIndex = tabIndex;
    this.cdr.markForCheck();
  }

  // ==================== Change Handler ====================

  onChange(): void {
    this.walkthroughChange.emit();
  }

  // ==================== Step Management (operate on active tab) ====================

  addStep(): void {
    const tab = this.activeTab;
    if (!tab) return;
    const newStep: WalkthroughStep = { step: '', config: [], media: [] };
    if (!tab.steps) tab.steps = [];
    tab.steps.push(newStep);
    // Auto-expand the new step
    const key = `${this.activeTabIndex}-${tab.steps.length - 1}`;
    this.expandedSteps.add(key);
    this.onChange();
  }

  removeStep(stepIndex: number): void {
    const tab = this.activeTab;
    if (!tab || !tab.steps) return;
    tab.steps.splice(stepIndex, 1);
    this.reindexCustomStepNames();
    this.onChange();
  }

  moveStepUp(stepIndex: number): void {
    const tab = this.activeTab;
    if (!tab || !tab.steps || stepIndex <= 0) return;
    [tab.steps[stepIndex - 1], tab.steps[stepIndex]] = [tab.steps[stepIndex], tab.steps[stepIndex - 1]];
    this.swapCustomStepNames(stepIndex - 1, stepIndex);
    this.onChange();
  }

  moveStepDown(stepIndex: number): void {
    const tab = this.activeTab;
    if (!tab || !tab.steps || stepIndex >= tab.steps.length - 1) return;
    [tab.steps[stepIndex], tab.steps[stepIndex + 1]] = [tab.steps[stepIndex + 1], tab.steps[stepIndex]];
    this.swapCustomStepNames(stepIndex, stepIndex + 1);
    this.onChange();
  }

  toggleStep(stepIndex: number): void {
    this.stepExpansionToggle.emit({ tabIndex: this.activeTabIndex, stepIndex });
  }

  isStepExpanded(stepIndex: number): boolean {
    return this.expandedSteps.has(`${this.activeTabIndex}-${stepIndex}`);
  }

  getStepTitle(step: WalkthroughStep, stepIndex: number): string {
    if (step.step && step.step.trim() !== '') {
      if (step.step === 'Custom') {
        return this.getCustomName(stepIndex) || 'Custom Step';
      }
      return step.step;
    }
    return `Step ${stepIndex + 1}`;
  }

  // ==================== Step Selection ====================

  onStepSelectionChange(step: WalkthroughStep, stepIndex: number): void {
    if (step.step === 'Custom') {
      this.setCustomName(stepIndex, this.getCustomName(stepIndex) || '');
    } else {
      this.deleteCustomName(stepIndex);
    }
    this.onChange();
  }

  onCustomStepNameChange(stepIndex: number, value: string): void {
    this.setCustomName(stepIndex, value);
    this.onChange();
  }

  isCustomStep(step: WalkthroughStep): boolean {
    return step.step === 'Custom';
  }

  // Used by template's [(ngModel)]
  getCustomName(stepIndex: number): string {
    const tab = this.customStepNames[this.activeTabIndex];
    return (tab && tab[stepIndex]) || '';
  }

  // ==================== Config Management ====================

  addConfig(stepIndex: number): void {
    const tab = this.activeTab;
    if (!tab || !tab.steps[stepIndex]) return;
    const step = tab.steps[stepIndex];
    if (!step.config) step.config = [];
    step.config.push({ field: '', value: '' });
    this.onChange();
  }

  removeConfig(stepIndex: number, configIndex: number): void {
    const tab = this.activeTab;
    if (!tab || !tab.steps[stepIndex]) return;
    tab.steps[stepIndex].config.splice(configIndex, 1);
    this.onChange();
  }

  // ==================== Autocomplete ====================

  onAutocompleteSelect(value: string, stepIndex: number, configIndex: number): void {
    const tab = this.activeTab;
    if (tab?.steps?.[stepIndex]?.config?.[configIndex]) {
      tab.steps[stepIndex].config[configIndex].field = value;
      this.onChange();
    }
  }

  getFieldSuggestions(stepName: string): string[] {
    return this.fieldSuggestionService.getFieldSuggestions(stepName);
  }

  // ==================== Helper Methods ====================

  private setCustomName(stepIndex: number, name: string): void {
    if (!this.customStepNames[this.activeTabIndex]) {
      this.customStepNames[this.activeTabIndex] = {};
    }
    this.customStepNames[this.activeTabIndex][stepIndex] = name;
  }

  private deleteCustomName(stepIndex: number): void {
    const tab = this.customStepNames[this.activeTabIndex];
    if (!tab) return;
    delete tab[stepIndex];
    if (Object.keys(tab).length === 0) {
      delete this.customStepNames[this.activeTabIndex];
    }
  }

  private swapCustomStepNames(a: number, b: number): void {
    const tab = this.customStepNames[this.activeTabIndex];
    if (!tab) return;
    const tmp = tab[a];
    if (tab[b] !== undefined) tab[a] = tab[b]; else delete tab[a];
    if (tmp !== undefined) tab[b] = tmp; else delete tab[b];
  }

  private reindexCustomStepNames(): void {
    const tab = this.activeTab;
    if (!tab) return;
    const oldNames = this.customStepNames[this.activeTabIndex] || {};
    const newNames: { [si: number]: string } = {};
    tab.steps.forEach((step, si) => {
      if (step.step === 'Custom' && oldNames[si]) {
        newNames[si] = oldNames[si];
      }
    });
    if (Object.keys(newNames).length > 0) {
      this.customStepNames[this.activeTabIndex] = newNames;
    } else {
      delete this.customStepNames[this.activeTabIndex];
    }
  }

  trackByIndex = TrackByUtil.index;
}
