import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { FAQService } from '../shared/services/faq.service';
import { FAQStorageService, EditedFAQ } from '../shared/services/faq-storage.service';
import { FAQExportService, ExportData, ExportProgress } from '../shared/services/faq-export.service';
import { FAQItem, FAQCategory } from '../shared/models/faq.model';
import { NotificationService } from '../shared/services/notification.service';
import { FAQPreviewService, PreviewData } from '../shared/services/faq-preview.service';
import { html_beautify } from 'js-beautify';

interface DOMSelection {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  isCollapsed: boolean;
  textOffset?: number; // Fallback: absolute text offset
}

interface EditHistory {
  content: string;
  selection: DOMSelection;
  timestamp: number;
  description: string;
  operationType: 'user' | 'system' | 'format' | 'paste';
  contentHash: string; // For detecting duplicate states
}

class UndoRedoManager {
  private history: EditHistory[] = [];
  private currentIndex = -1;
  private readonly maxHistory = 50;
  private lastSaveTime = 0;
  private readonly minSaveInterval = 500; // Minimum 500ms between saves
  private editorElement: HTMLElement | null = null;

  setEditorElement(element: HTMLElement): void {
    this.editorElement = element;
  }

  private generateContentHash(content: string): string {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private getCurrentDOMSelection(): DOMSelection {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.editorElement) {
      return {
        startPath: [],
        startOffset: 0,
        endPath: [],
        endOffset: 0,
        isCollapsed: true,
        textOffset: 0
      };
    }

    const range = selection.getRangeAt(0);
    const startPath = this.getNodePath(range.startContainer);
    const endPath = this.getNodePath(range.endContainer);
    
    // Calculate text offset as fallback
    const textOffset = this.calculateTextOffset(range.startContainer, range.startOffset);
    
    return {
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
      isCollapsed: range.collapsed,
      textOffset
    };
  }

  private getNodePath(node: Node): number[] {
    if (!this.editorElement) return [];
    
    const path: number[] = [];
    let current: Node | null = node;
    
    // Walk up the tree until we reach the editor element
    while (current && current !== this.editorElement) {
      const parent: Node | null = current.parentNode;
      if (parent) {
        const index = Array.from(parent.childNodes).indexOf(current as ChildNode);
        if (index !== -1) {
          path.unshift(index);
        }
      }
      current = parent;
    }
    
    return path;
  }

  private calculateTextOffset(node: Node, offset: number): number {
    if (!this.editorElement) return 0;
    
    let totalOffset = 0;
    const walker = document.createTreeWalker(
      this.editorElement,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let currentNode;
    while (currentNode = walker.nextNode()) {
      if (currentNode === node) {
        return totalOffset + offset;
      }
      totalOffset += currentNode.textContent?.length || 0;
    }
    
    return totalOffset;
  }

  private restoreDOMSelection(selection: DOMSelection): void {
    if (!this.editorElement) {
      return;
    }
    
    try {
      const windowSelection = window.getSelection();
      if (!windowSelection) {
        return;
      }

      // Try to find nodes by path
      const startNode = this.getNodeByPath(selection.startPath);
      const endNode = this.getNodeByPath(selection.endPath);
      
      if (startNode && endNode) {
        // Successfully found nodes by path
        const range = document.createRange();
        
        // Validate offsets
        const maxStartOffset = this.getMaxOffset(startNode);
        const maxEndOffset = this.getMaxOffset(endNode);
        const safeStartOffset = Math.min(selection.startOffset, maxStartOffset);
        const safeEndOffset = Math.min(selection.endOffset, maxEndOffset);
        
        range.setStart(startNode, safeStartOffset);
        range.setEnd(endNode, safeEndOffset);
        
        windowSelection.removeAllRanges();
        windowSelection.addRange(range);
      } else if (selection.textOffset !== undefined) {
        // Fallback: use text offset
        this.restoreByTextOffset(selection.textOffset);
      } else {
        // Last resort: place at end
        this.placeCursorAtEnd();
      }
    } catch (error) {
      console.warn('Could not restore DOM selection:', error);
      // Try text offset as fallback
      if (selection.textOffset !== undefined) {
        this.restoreByTextOffset(selection.textOffset);
      }
    }
  }

  private getNodeByPath(path: number[]): Node | null {
    if (!this.editorElement || path.length === 0) {
      return this.editorElement;
    }
    
    let current: Node = this.editorElement;
    for (const index of path) {
      if (current.childNodes && index < current.childNodes.length) {
        current = current.childNodes[index];
      } else {
        return null; // Path no longer valid
      }
    }
    
    return current;
  }

  private restoreByTextOffset(textOffset: number): void {
    if (!this.editorElement) return;
    
    try {
      const walker = document.createTreeWalker(
        this.editorElement,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let currentOffset = 0;
      let currentNode;
      
      while (currentNode = walker.nextNode()) {
        const nodeLength = currentNode.textContent?.length || 0;
        if (currentOffset + nodeLength >= textOffset) {
          // Found the target node
          const relativeOffset = Math.min(textOffset - currentOffset, nodeLength);
          
          const selection = window.getSelection();
          const range = document.createRange();
          range.setStart(currentNode, relativeOffset);
          range.collapse(true);
          
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
        currentOffset += nodeLength;
      }
      
      // If we couldn't find the exact position, place at end
      this.placeCursorAtEnd();
    } catch (error) {
      console.warn('Could not restore by text offset:', error);
      this.placeCursorAtEnd();
    }
  }

  private getMaxOffset(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length || 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      return node.childNodes.length;
    }
    return 0;
  }


  private placeCursorAtEnd(): void {
    if (!this.editorElement) return;
    
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(this.editorElement);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch (error) {
      console.warn('Could not place cursor at end:', error);
    }
  }

  saveState(
    content: string, 
    description: string = 'Edit', 
    operationType: EditHistory['operationType'] = 'user',
    forceNewState = false
  ): boolean {
    const now = Date.now();
    
    // Rate limiting: don't save too frequently unless forced
    if (!forceNewState && (now - this.lastSaveTime) < this.minSaveInterval) {
      return false;
    }
    
    const contentHash = this.generateContentHash(content);
    const selection = this.getCurrentDOMSelection();
    
    // Don't save duplicate states (same content and operation type)
    const lastState = this.getCurrentState();
    if (!forceNewState && lastState && 
        lastState.contentHash === contentHash && 
        lastState.operationType === operationType) {
      return false;
    }
    
    // Remove any redo history when new change is made
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new state
    this.history.push({
      content,
      selection,
      timestamp: now,
      description,
      operationType,
      contentHash
    });

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
    
    this.lastSaveTime = now;
    return true;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  undo(): EditHistory | null {
    if (this.canUndo()) {
      this.currentIndex--;
      const state = this.history[this.currentIndex];
      // Don't restore selection here - let caller handle it after DOM update
      return state;
    }
    return null;
  }

  redo(): EditHistory | null {
    if (this.canRedo()) {
      this.currentIndex++;
      const state = this.history[this.currentIndex];
      // Don't restore selection here - let caller handle it after DOM update
      return state;
    }
    return null;
  }

  // New method to restore selection manually
  restoreSelection(state: EditHistory): void {
    this.restoreDOMSelection(state.selection);
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.lastSaveTime = 0;
  }

  getCurrentState(): EditHistory | null {
    return this.currentIndex >= 0 ? this.history[this.currentIndex] : null;
  }

  getHistoryInfo(): { 
    canUndo: boolean, 
    canRedo: boolean, 
    historySize: number,
    currentIndex: number,
    recentOperations: string[]
  } {
    const recentOps = this.history
      .slice(Math.max(0, this.currentIndex - 2), this.currentIndex + 1)
      .map(h => h.description);
      
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      historySize: this.history.length,
      currentIndex: this.currentIndex,
      recentOperations: recentOps
    };
  }

  // Debug method to inspect history
  getFullHistory(): EditHistory[] {
    return [...this.history];
  }
}

interface FAQTab {
  id: string;
  title: string;
  faq: FAQItem;
  hasChanges: boolean;
  isActive: boolean;
  editorContent: string;
  currentQuestion: string;
  currentCategory: string;
  currentSubCategory: string;
  currentIsActive: boolean;
}

interface FAQTitleItem {
  id: string;
  faqId: string;
  title: string;
}

interface EditorState {
  selectedFAQ: FAQItem | null;
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  lastSaved: Date | null;
  showVersionHistory: boolean;
  showExportDialog: boolean;
  showImportDialog: boolean;
  saveError: string | null;
  isExporting: boolean;
  exportProgress: ExportProgress | null;
  // Tab management
  tabs: FAQTab[];
  activeTabId: string | null;
  // Preview mode
  previewMode: 'rendered' | 'source';
}

@Component({
  selector: 'app-faq-editor',
  templateUrl: './faq-editor.component.html',
  styleUrls: ['./faq-editor.component.scss']
})
export class FaqEditorComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('htmlSourceEditor', { static: false }) htmlSourceEditor!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  @ViewChild('imageInput', { static: false }) imageInput!: ElementRef;
  
  private destroy$ = new Subject<void>();
  private autoSaveTimer: any;
  private contentChangeSubject = new Subject<string>();
  private previewUpdateTimer: any;
  private undoRedoManager = new UndoRedoManager();
  private isUndoRedoOperation = false;
  
  faqList: FAQItem[] = [];
  filteredFAQs: FAQItem[] = [];
  editedFAQs = new Map<string, EditedFAQ>();
  versionHistory: EditedFAQ[] = [];
  
  state: EditorState = {
    selectedFAQ: null,
    isEditing: false,
    isLoading: false,
    isSaving: false,
    hasChanges: false,
    lastSaved: null,
    showVersionHistory: false,
    showExportDialog: false,
    showImportDialog: false,
    saveError: null,
    isExporting: false,
    exportProgress: null,
    // Tab management
    tabs: [],
    activeTabId: null,
    // Preview mode
    previewMode: 'rendered'
  };
  
  searchQuery = '';
  selectedCategory = '';
  categories: string[] = [];
  subCategories: string[] = [];
  categoriesData: FAQCategory[] = [];
  
  editorContent = '';
  currentQuestion = '';
  currentCategory = '';
  currentSubCategory = '';
  currentIsActive = true;
  previewContent: SafeHtml = '';
  
  storageStats = { used: 0, available: 0, percentage: 0 };
  
  // Tooltip state
  showTooltip: 'created' | 'edited' | null = null;
  
  // Temporary image storage for uploaded images
  private tempImageMap = new Map<string, File>();
  private tempImageUrls = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private faqService: FAQService,
    private storageService: FAQStorageService,
    private exportService: FAQExportService,
    private sanitizer: DomSanitizer,
    private notificationService: NotificationService,
    private previewService: FAQPreviewService
  ) {}

  ngOnInit(): void {
    this.loadFAQData();
    this.loadEditedFAQs();
    this.updateStorageStats();
    
    // Setup smart auto-save with debouncing
    this.setupSmartAutoSave();
    
    // Keep the original timer as fallback
    this.autoSaveTimer = setInterval(() => {
      if (this.state.hasChanges && this.state.selectedFAQ) {
        this.saveFAQ(true); // true indicates auto-save
      }
    }, 120000); // Increased to 2 minutes since we have smart auto-save
  }

  private setupSmartAutoSave(): void {
    this.contentChangeSubject.pipe(
      debounceTime(3000), // Wait for user to stop typing for 3 seconds
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.state.hasChanges && this.state.selectedFAQ) {
        this.saveFAQ(true); // Auto-save
      }
    });
  }

  ngAfterViewInit(): void {
    // Initialize undo manager with the editor element
    if (this.htmlSourceEditor?.nativeElement) {
      this.undoRedoManager.setEditorElement(this.htmlSourceEditor.nativeElement);
    }
  }

  // Keyboard shortcuts
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Only apply HTML editing shortcuts when textarea is focused
    const isTextareaFocused = event.target === this.htmlSourceEditor?.nativeElement;
    
    // Ctrl+S or Cmd+S for save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (this.state.hasChanges && this.state.selectedFAQ) {
        this.saveFAQ();
      }
    }
    
    // HTML formatting and text editing shortcuts (only when textarea is focused)
    if (isTextareaFocused && this.state.selectedFAQ) {
      // Alt+Shift+F for HTML format (VS Code standard)
      if (event.altKey && event.shiftKey && event.key === 'F') {
        event.preventDefault();
        this.formatHTML();
        return;
      }
      
      // Ctrl+B for bold
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        this.wrapSelectedText('<strong>', '</strong>');
        return;
      }
      
      // Ctrl+I for italic
      if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
        event.preventDefault();
        this.wrapSelectedText('<em>', '</em>');
        return;
      }
      
      // Ctrl+U for underline
      if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
        event.preventDefault();
        this.wrapSelectedText('<u>', '</u>');
        return;
      }
      
      // Ctrl+K for link
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        this.insertLink();
        return;
      }
    }
    
    // Ctrl+Z for undo (when textarea is focused)
    if (isTextareaFocused && (event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.performUndo();
      return;
    }
    
    // Ctrl+Y or Ctrl+Shift+Z for redo (when textarea is focused)
    if (isTextareaFocused && (event.ctrlKey || event.metaKey) && 
        (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
      event.preventDefault();
      this.performRedo();
      return;
    }
    
    
    // Escape to close dialogs
    if (event.key === 'Escape') {
      this.state.showExportDialog = false;
      this.state.showImportDialog = false;
      this.state.showVersionHistory = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    if (this.previewUpdateTimer) {
      clearTimeout(this.previewUpdateTimer);
    }
    
    // Save any pending changes
    if (this.state.hasChanges && this.state.selectedFAQ) {
      this.saveFAQ();
    }
    
    // Clean up temporary image URLs
    this.cleanupTempImageUrls();
  }


  private loadFAQData(): void {
    this.faqService.getAllFAQsForEditor()
      .pipe(takeUntil(this.destroy$))
      .subscribe(faqs => {
        this.faqList = faqs;
        this.filteredFAQs = faqs;
        this.extractCategories();
      });
  }

  private loadEditedFAQs(): void {
    this.storageService.getEditedFAQs()
      .pipe(takeUntil(this.destroy$))
      .subscribe(edited => {
        this.editedFAQs = edited;
      });
  }

  private extractCategories(): void {
    // Get categories with subcategories from FAQ service
    this.faqService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe(categoriesData => {
        this.categoriesData = categoriesData;
        this.categories = categoriesData.map(cat => cat.name).sort();
        
        // Update subcategories for current selected category
        this.updateSubCategories();
      });
  }

  /**
   * Update subcategories based on current selected category
   */
  private updateSubCategories(): void {
    if (!this.currentCategory) {
      this.subCategories = [];
      return;
    }

    const categoryData = this.categoriesData.find(cat => cat.name === this.currentCategory);
    if (categoryData && categoryData.subCategories.length > 0) {
      this.subCategories = categoryData.subCategories.map(sub => sub.name).sort();
    } else {
      this.subCategories = [];
    }
  }

  /**
   * Handle category change - update subcategories and clear invalid subcategory
   */
  onCategoryChange(): void {
    this.updateSubCategories();
    
    // Clear subcategory if it's not valid for the new category
    if (this.currentSubCategory && !this.subCategories.includes(this.currentSubCategory)) {
      this.currentSubCategory = '';
    }
    
    this.state.hasChanges = true;
    this.onTabContentChange();
  }

  /**
   * Handle subcategory change
   */
  onSubCategoryChange(): void {
    this.state.hasChanges = true;
    this.onTabContentChange();
  }

  private updateStorageStats(): void {
    this.storageService.getStorageStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.storageStats = {
          used: stats.used,
          available: stats.available,
          percentage: stats.available > 0 ? (stats.used / stats.available) * 100 : 0
        };
      });
  }

  selectFAQ(faq: FAQItem): void {
    // Use tab system if tabs are enabled
    if (this.state.tabs.length > 0 || true) { // Always use tab system
      this.loadFAQToTab(faq);
      return;
    }

    // Legacy single FAQ mode (kept for compatibility)
    // Save current FAQ if there are changes
    if (this.state.hasChanges && this.state.selectedFAQ) {
      this.saveFAQ();
    }

    this.state.selectedFAQ = faq;
    this.state.isLoading = true; // Show loading indicator
    this.currentQuestion = faq.question;
    this.currentCategory = faq.category;
    this.currentSubCategory = faq.subCategory || '';
    this.currentIsActive = faq.isActive !== false; // Default to true if not specified
    
    // Update subcategories for the selected category
    this.updateSubCategories();
    
    // Clear preview immediately to prevent showing old content
    this.previewContent = this.sanitizer.bypassSecurityTrustHtml('');
    
    // Clear undo history when switching FAQs
    this.clearUndoHistory();
    
    // Load edited content if exists (should be original HTML source)
    const edited = this.editedFAQs.get(faq.id);
    if (edited) {
      // Convert edited content to URL format for editor display
      const editableContent = this.convertImgsToUrls(edited!.answer);
      this.editorContent = editableContent;
      this.currentQuestion = edited!.question;
      this.currentCategory = edited!.category;
      this.currentSubCategory = edited!.subCategory || '';
      this.currentIsActive = edited!.isActive ?? true; // Default to true if not specified
      
      // Set content directly in DOM after view init
      setTimeout(() => {
        if (this.htmlSourceEditor?.nativeElement) {
          this.htmlSourceEditor.nativeElement.innerHTML = editableContent;
        }
        
        this.state.isLoading = false;
        
        // Initialize undo state
        this.initializeUndoState();
        
        // Update preview AFTER DOM content is set
        this.updatePreview();
        // Also update external preview for content loading
        this.debouncedPreviewUpdate();
      }, 0);
    } else {
      // Load original content
      this.loadOriginalContent(faq);
    }
    
    this.state.hasChanges = false;
  }

  private loadOriginalContent(faq: FAQItem): void {
    // Load raw HTML content for editing (minimal processing)
    this.loadRawHTMLForEditing(faq.folderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rawHtmlContent) => {
          // Minimal processing - only decode HTML entities, preserve all HTML structure
          const editableContent = this.prepareContentForEditing(rawHtmlContent);
          
          this.editorContent = editableContent;
          
          // Set content directly in DOM
          setTimeout(() => {
            if (this.htmlSourceEditor?.nativeElement) {
              this.htmlSourceEditor.nativeElement.innerHTML = editableContent;
            }
            
            this.state.isLoading = false;
            
            // Initialize undo state
            this.initializeUndoState();
            
            // Update preview AFTER DOM content is set
            this.updatePreview();
            // Also update external preview for raw content loading
            this.debouncedPreviewUpdate();
          }, 0);
        },
        error: (error) => {
          console.error('❌ Error loading raw HTML content:', error);
          this.editorContent = '<p>Error loading content</p>';
          
          // Set error content in DOM and update preview
          setTimeout(() => {
            if (this.htmlSourceEditor?.nativeElement) {
              this.htmlSourceEditor.nativeElement.innerHTML = this.editorContent;
            }
            
            this.state.isLoading = false;
            
            // Update preview with error content or fallback to FAQ service
            this.updatePreview();
            // Also update external preview for error content
            this.debouncedPreviewUpdate();
            
            // Fallback to FAQ service preview if available
            this.updatePreviewFromFAQService(faq);
          }, 0);
        }
      });
  }

  /**
   * Unified FAQ save method that handles both current FAQ and tab-based saves
   */
  private async saveGenericFAQ(
    saveContext: 'current' | 'tab',
    tabData?: FAQTab,
    options: { isAutoSave?: boolean; silent?: boolean } = {}
  ): Promise<void> {
    const { isAutoSave = false, silent = false } = options;
    
    // Determine data source based on context
    let faqId: string;
    let question: string;
    let rawContent: string;
    let category: string;
    let subCategory: string | undefined;
    let isActive: boolean;
    
    if (saveContext === 'current') {
      if (!this.state.selectedFAQ) {
        throw new Error('No FAQ selected for current save');
      }
      
      // Get data from current editor state
      faqId = this.state.selectedFAQ.id;
      question = this.currentQuestion;
      category = this.currentCategory;
      subCategory = this.currentSubCategory || undefined;
      isActive = this.currentIsActive;
      
      // Get content from actual editor DOM
      const editorElement = this.htmlSourceEditor?.nativeElement;
      rawContent = editorElement?.innerHTML || this.editorContent;
    } else {
      if (!tabData) {
        throw new Error('Tab data required for tab save');
      }
      
      // Get data from tab
      faqId = tabData.faq.id;
      question = tabData.currentQuestion;
      category = tabData.currentCategory;
      subCategory = tabData.currentSubCategory;
      isActive = tabData.currentIsActive;
      rawContent = tabData.editorContent;
    }
    
    // Set saving state for current context
    if (saveContext === 'current') {
      this.state.isSaving = true;
      this.state.saveError = null;
    }
    
    try {
      // Clean the content to remove any unwanted elements
      const cleanedContent = this.cleanEditorContent(rawContent);
      
      // Convert URL format back to img tags for saving (use actual paths, not blob URLs)
      const htmlContent = this.convertUrlsToImgs(cleanedContent, true);
      
      // Debug logging (only for current saves to avoid spam)
      const faqData: Partial<EditedFAQ> = {
        faqId,
        question,
        answer: htmlContent,
        category,
        subCategory,
        isActive
      };

      const success = await this.storageService.saveFAQ(faqData);
      
      if (success) {
        // Update state based on context
        if (saveContext === 'current') {
          this.state.hasChanges = false;
          this.state.lastSaved = new Date();
          this.state.saveError = null;
          
          // IMPORTANT: Sync with current tab state to ensure UI consistency
          // This ensures unsaved count is accurate after individual saves
          const currentTab = this.getCurrentTab();
          if (currentTab) {
            currentTab.hasChanges = false;
          }
          
          // Update preview if open
          this.updatePreviewIfOpen();
          
          // Show notification only for manual saves
          if (!isAutoSave && !silent) {
            this.notificationService.saveSuccess(this.getTruncatedTitle(question));
          }
        } else if (tabData) {
          // Update tab state
          tabData.hasChanges = false;
          
          // IMPORTANT: Sync with global state if this is the current active tab
          // This ensures UI consistency when saving via Save All
          if (this.isCurrentActiveTab(tabData)) {
            this.state.hasChanges = false;
            this.state.lastSaved = new Date();
            this.state.saveError = null;
          }
        }
        
        // Always reload edited FAQs to keep UI in sync
        this.loadEditedFAQs();
      } else {
        throw new Error('Failed to save to storage');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error occurred';
      
      if (saveContext === 'current') {
        this.state.saveError = errorMessage;
        if (!silent) {
          this.notificationService.saveError(
            this.getTruncatedTitle(question), 
            errorMessage
          );
        }
      }
      
      console.error('Save error:', error);
      throw error; // Re-throw for caller handling
    } finally {
      if (saveContext === 'current') {
        this.state.isSaving = false;
      }
    }
  }

  saveFAQ(isAutoSave = false): void {
    this.saveGenericFAQ('current', undefined, { isAutoSave })
      .catch(error => {
        // Error already handled in saveGenericFAQ
        console.error('saveFAQ failed:', error);
      });
  }

  private getTruncatedTitle(title: string, maxLength = 40): string {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  }

  /**
   * Focus the editor and ensure it's ready for editing
   */
  private focusEditor(): void {
    if (this.htmlSourceEditor?.nativeElement) {
      this.htmlSourceEditor.nativeElement.focus();
    }
  }

  /**
   * Get current content from the editor DOM
   */
  private getCurrentEditorContent(): string {
    return this.htmlSourceEditor?.nativeElement?.innerHTML || '';
  }

  /**
   * Set content in the editor DOM (used for fallback scenarios)
   */
  private setEditorContent(content: string): void {
    if (this.htmlSourceEditor?.nativeElement) {
      this.isUndoRedoOperation = true;
      
      // For fallback scenarios, directly set innerHTML
      this.htmlSourceEditor.nativeElement.innerHTML = content;
      this.editorContent = content;
      this.updatePreview();
      this.debouncedPreviewUpdate(); // Sync external preview for undo operation
      
      // Reset flag after a short delay to allow event propagation
      setTimeout(() => {
        this.isUndoRedoOperation = false;
      }, 50);
    }
  }

  /**
   * Handle changes in the WYSIWYG editor
   */
  onEditorContentChange(): void {
    // Skip processing if this is an undo/redo operation
    if (this.isUndoRedoOperation) {
      return;
    }
    
    this.state.hasChanges = true;
    this.state.saveError = null;
    
    // Get current content from DOM immediately for consistency
    const currentContent = this.getCurrentEditorContent();
    this.editorContent = currentContent;
    
    // Update preview immediately with the same content
    this.updatePreview();
    
    // Native contenteditable handles undo history automatically
    
    // Trigger smart auto-save with immediate content update (no debouncing for sync)
    this.contentChangeSubject.next(currentContent);
    
    // Update external preview with debouncing
    this.debouncedPreviewUpdate();
  }

  /**
   * Immediate content update (legacy method kept for compatibility)
   * Now performs immediate sync without debouncing delays and supports tabs
   */
  private debouncedContentUpdate(): void {
    // Immediate update - no more delays that cause sync issues
    const currentContent = this.getCurrentEditorContent();
    this.editorContent = currentContent;
    
    // Update current tab if using tab system
    this.onTabContentChange();
    
    this.contentChangeSubject.next(currentContent);
    
    // Update external preview tab with debouncing to prevent excessive updates
    this.debouncedPreviewUpdate();
  }

  resetCurrentFAQ(): void {
    if (!this.state.selectedFAQ) return;

    this.selectFAQ(this.state.selectedFAQ);
    
    // Show notification
    this.notificationService.resetWarning(this.getTruncatedTitle(this.state.selectedFAQ.question));
  }


  /**
   * Update preview using current DOM content as single source of truth
   */
  private updatePreview(): void {
    // Always use current DOM content to ensure preview matches exactly what will be saved
    const editorElement = this.htmlSourceEditor?.nativeElement;
    const editorContent = editorElement?.innerHTML || this.editorContent;
    
    // Convert URL format to img tags for preview display (use blob URLs for temporary images)
    let previewContent = this.convertUrlsToImgs(editorContent);
    
    // Decode HTML entities in preview content to show actual characters
    previewContent = this.decodeHTMLEntities(previewContent);
    
    // Update internal state to match DOM for consistency
    this.editorContent = editorContent;
    
    // Update preview with converted content (shows actual images)
    this.previewContent = this.sanitizer.bypassSecurityTrustHtml(previewContent);
  }

  /**
   * Update preview using full FAQ service processing pipeline
   * This shows what users will actually see on the FAQ pages
   */
  private updatePreviewFromFAQService(faq: FAQItem): void {
    if (!faq || !faq.folderId) {
      this.updatePreview(); // Fallback to simple preview
      return;
    }

    this.faqService.getFAQContent(faq.folderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (processedContent) => {
          this.previewContent = processedContent;
        },
        error: (error) => {
          console.error('Error getting processed content for preview:', error);
          this.updatePreview(); // Fallback to simple preview
        }
      });
  }

  filterFAQs(): void {
    this.filteredFAQs = this.faqList.filter(faq => {
      const matchesSearch = !this.searchQuery || 
        faq.question.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        faq.id.toLowerCase().includes(this.searchQuery.toLowerCase());
      
      const matchesCategory = !this.selectedCategory || 
        faq.category === this.selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }

  async showVersionHistory(): Promise<void> {
    if (!this.state.selectedFAQ) return;
    
    this.versionHistory = await this.storageService.getVersionHistory(this.state.selectedFAQ.id);
    this.state.showVersionHistory = true;
  }

  async restoreVersion(version: EditedFAQ): Promise<void> {
    const success = await this.storageService.restoreVersion(version.id);
    if (success && this.state.selectedFAQ) {
      this.state.showVersionHistory = false;
      this.selectFAQ(this.state.selectedFAQ);
    }
  }

  async exportAll(): Promise<void> {
    this.state.isExporting = true;
    this.state.exportProgress = null;
    
    try {
      const exportData = await this.exportService.exportAllEdits();
      
      // Use new ZIP export with progress tracking and temporary images
      await this.exportService.downloadAsZip(exportData, (progress: ExportProgress) => {
        this.state.exportProgress = progress;
      }, this.tempImageMap);
      
      this.notificationService.exportSuccess(Object.keys(exportData.htmlContent).length);
      this.state.showExportDialog = false;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error occurred during export';
      this.notificationService.exportError(errorMessage);
      console.error('Export error:', error);
    } finally {
      this.state.isExporting = false;
      this.state.exportProgress = null;
    }
  }

  async exportSeparateFiles(): Promise<void> {
    this.state.isExporting = true;
    
    try {
      const exportData = await this.exportService.exportAllEdits();
      
      // Download files separately (legacy method)
      this.exportService.downloadFAQsJSON(exportData);
      this.exportService.downloadInstructions(exportData);
      
      // Download HTML files with delay
      setTimeout(() => {
        this.exportService.downloadHTMLFiles(exportData);
      }, 1000);
      
      this.notificationService.exportSuccess(Object.keys(exportData.htmlContent).length + 2);
      this.state.showExportDialog = false;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error occurred during export';
      this.notificationService.exportError(errorMessage);
      console.error('Export error:', error);
    } finally {
      this.state.isExporting = false;
    }
  }

  async exportJSON(): Promise<void> {
    this.state.isExporting = true;
    
    try {
      const exportData = await this.exportService.exportAllEdits();
      this.exportService.downloadAsJSON(exportData);
      this.notificationService.exportSuccess(1);
      this.state.showExportDialog = false;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error occurred during export';
      this.notificationService.exportError(errorMessage);
      console.error('Export JSON error:', error);
    } finally {
      this.state.isExporting = false;
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    const fileName = file.name.toLowerCase();
    
    let success = false;
    let importType = '';
    
    try {
      if (fileName.endsWith('.json')) {
        importType = 'JSON';
        success = await this.exportService.importFromJSON(file);
      } else if (fileName.endsWith('.zip')) {
        importType = 'ZIP';
        success = await this.exportService.importFromZip(file);
      } else {
        alert('Unsupported file format. Please select a .json or .zip file.');
        this.state.showImportDialog = false;
        input.value = '';
        return;
      }
      
      if (success) {
        this.loadEditedFAQs();
        this.notificationService.success(`${importType} import completed successfully!`);
      } else {
        this.notificationService.error(`${importType} import failed. Please check the file format and content.`);
        console.error(`${importType} import failed for file:`, file.name);
      }
    } catch (error) {
      console.error('Error during import:', error);
      this.notificationService.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    this.state.showImportDialog = false;
    input.value = '';
  }

  async clearAllEdits(): Promise<void> {
    if (confirm('Are you sure you want to clear all edits? This cannot be undone.')) {
      const success = await this.storageService.clearAllEdits();
      if (success) {
        // Clear all editor state
        this.resetEditorState();
        
        // Reload data
        this.loadEditedFAQs();
        this.updateStorageStats();
        
        // Show success notification and refresh immediately
        this.notificationService.success('All edits cleared - ready for new FAQ creation');
        window.location.reload();
      } else {
        this.notificationService.error('Failed to clear edits');
      }
    }
  }

  /**
   * Reset editor to initial state
   */
  private resetEditorState(): void {
    // Clear all tabs
    this.state.tabs = [];
    this.state.activeTabId = null;
    
    // Reset selected FAQ and editor content
    this.state.selectedFAQ = null;
    this.editorContent = '';
    this.currentQuestion = '';
    this.currentCategory = '';
    this.currentSubCategory = '';
    this.currentIsActive = true;
    
    // Reset state flags
    this.state.hasChanges = false;
    this.state.isEditing = false;
    this.state.isSaving = false;
    this.state.saveError = null;
    this.state.lastSaved = null;
    
    // Clear local data structures
    this.editedFAQs.clear();
    this.versionHistory = [];
    
    // Clear undo/redo history
    this.undoRedoManager = new UndoRedoManager();
    
    // Clear temporary images
    this.cleanupTempImageUrls();
    this.tempImageMap.clear();
    
    // Create a default new FAQ tab to maintain user workflow
    this.createDefaultTab();
    
    // Reset search if active
    this.searchQuery = '';
    this.selectedCategory = '';
    this.filterFAQs();
    
    // Close any open dialogs
    this.state.showVersionHistory = false;
    this.state.showExportDialog = false;
    this.state.showImportDialog = false;
    
  }

  /**
   * Create a default tab after clearing all edits
   */
  private createDefaultTab(): void {
    const newFAQ: FAQItem & { isNew?: boolean } = {
      id: this.generateUUID(),
      question: 'New FAQ Question',
      category: this.categories.length > 0 ? this.categories[0] : 'General',
      folderId: '',
      answer: '',
      isNew: true
    };

    const tab: FAQTab = {
      id: this.generateUUID(),
      title: 'New FAQ',
      faq: newFAQ,
      hasChanges: false,
      isActive: true,
      editorContent: '<p>Enter your FAQ answer here...</p>',
      currentQuestion: newFAQ.question,
      currentCategory: newFAQ.category,
      currentSubCategory: newFAQ.subCategory || '',
      currentIsActive: true
    };

    // Add the new tab and make it active
    this.state.tabs = [tab];
    this.state.activeTabId = tab.id;
    this.state.selectedFAQ = newFAQ;

    // Set up editor content for the new FAQ
    this.currentQuestion = newFAQ.question;
    this.currentCategory = newFAQ.category;
    this.currentSubCategory = newFAQ.subCategory || '';
    this.currentIsActive = true; // New FAQs are active by default
    this.editorContent = '<p>Enter your FAQ answer here...</p>';
    
  }

  getEditedCount(): number {
    return this.editedFAQs.size;
  }

  getUnsavedChangesCount(): number {
    let count = 0;
    
    // Count unsaved changes in all tabs (including current tab)
    // Each tab tracks its own hasChanges state, so no double counting
    for (const tab of this.state.tabs) {
      if (tab.hasChanges) {
        count++;
      }
    }
    
    return count;
  }

  async saveAllFAQs(): Promise<void> {
    const unsavedChanges = this.getUnsavedChangesCount();
    if (unsavedChanges === 0) return;

    // Show progress notification
    let savedCount = 0;
    let errorCount = 0;
    
    try {
      // Save all tabs with changes (including current active tab)
      for (const tab of this.state.tabs) {
        if (tab.hasChanges) {
          try {
            await this.saveTab(tab);
            savedCount++;
          } catch (error) {
            console.error('Error saving tab:', tab.title, error);
            errorCount++;
          }
        }
      }
      
      // Show completion notification
      if (errorCount === 0) {
        this.notificationService.success(`Successfully saved ${savedCount} changes`);
      } else if (savedCount > 0) {
        this.notificationService.warning(`Saved ${savedCount} changes, ${errorCount} failed`);
      } else {
        this.notificationService.error(`Save failed, please check your connection`);
      }
      
    } catch (error) {
      console.error('Error in saveAllFAQs:', error);
      this.notificationService.error('Error occurred during save process');
    }
  }


  private async saveTab(tab: FAQTab): Promise<void> {
    return this.saveGenericFAQ('tab', tab, { silent: true });
  }

  /**
   * Check if the given tab is the currently active tab in the editor
   */
  private isCurrentActiveTab(tab: FAQTab): boolean {
    return this.state.selectedFAQ?.id === tab.faq.id;
  }

  getCreatedCount(): number {
    // Count FAQs that don't exist in the original FAQ list (new FAQs)
    let createdCount = 0;
    const originalFAQIds = new Set(this.faqList.map(f => f.id));
    
    this.editedFAQs.forEach((editedFAQ) => {
      if (!originalFAQIds.has(editedFAQ.faqId)) {
        createdCount++;
      }
    });
    
    return createdCount;
  }

  getEditedExistingCount(): number {
    // Count FAQs that exist in the original FAQ list (edited existing FAQs)
    let editedCount = 0;
    const originalFAQIds = new Set(this.faqList.map(f => f.id));
    
    this.editedFAQs.forEach((editedFAQ) => {
      if (originalFAQIds.has(editedFAQ.faqId)) {
        editedCount++;
      }
    });
    
    return editedCount;
  }

  getCreatedFAQTitles(): FAQTitleItem[] {
    const originalFAQIds = new Set(this.faqList.map(f => f.id));
    const items: FAQTitleItem[] = [];
    
    this.editedFAQs.forEach((editedFAQ) => {
      if (!originalFAQIds.has(editedFAQ.faqId)) {
        // Truncate long titles to prevent tooltip overflow
        const truncatedTitle = editedFAQ.question.length > 60 
          ? editedFAQ.question.substring(0, 60) + '...' 
          : editedFAQ.question;
        items.push({
          id: editedFAQ.id,
          faqId: editedFAQ.faqId,
          title: truncatedTitle
        });
      }
    });
    
    // Sort alphabetically and limit to 10 items
    return items.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 10);
  }

  getEditedExistingFAQTitles(): FAQTitleItem[] {
    const originalFAQIds = new Set(this.faqList.map(f => f.id));
    const items: FAQTitleItem[] = [];
    
    this.editedFAQs.forEach((editedFAQ) => {
      if (originalFAQIds.has(editedFAQ.faqId)) {
        // Truncate long titles to prevent tooltip overflow
        const truncatedTitle = editedFAQ.question.length > 60 
          ? editedFAQ.question.substring(0, 60) + '...' 
          : editedFAQ.question;
        items.push({
          id: editedFAQ.id,
          faqId: editedFAQ.faqId,
          title: truncatedTitle
        });
      }
    });
    
    // Sort alphabetically and limit to 10 items
    return items.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 10);
  }

  isEdited(faq: FAQItem): boolean {
    return this.editedFAQs.has(faq.id);
  }

  /**
   * Handle click on FAQ title in tooltip
   */
  onTooltipFAQClick(faqId: string): void {
    // Hide tooltip immediately
    this.showTooltip = null;
    
    const editedFAQ = this.editedFAQs.get(faqId);
    if (!editedFAQ) {
      console.error('FAQ not found:', faqId);
      this.notificationService.error('FAQ not found', 'Unable to locate the selected FAQ');
      return;
    }

    const originalFAQIds = new Set(this.faqList.map(f => f.id));
    
    if (originalFAQIds.has(faqId)) {
      // This is an edited existing FAQ - find the original FAQ
      const originalFAQ = this.faqList.find(f => f.id === faqId);
      if (originalFAQ) {
        this.selectFAQ(originalFAQ);
      } else {
        console.error('Original FAQ not found:', faqId);
        this.notificationService.error('FAQ not found', 'Unable to locate the original FAQ');
      }
    } else {
      // This is a new FAQ - create a mock FAQItem for loading
      const mockFAQItem: FAQItem = {
        id: editedFAQ.faqId,
        question: editedFAQ.question,
        category: editedFAQ.category,
        subCategory: editedFAQ.subCategory || undefined,
        folderId: '',
        answer: ''
      };
      
      // Load the new FAQ into a tab
      this.loadFAQToTab(mockFAQItem);
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(date: Date | null): string {
    if (!date) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  /**
   * Load raw HTML content for editing - completely preserve source file
   */
  private loadRawHTMLForEditing(folderId: string): Observable<string> {
    if (!folderId) {
      return of('');
    }
    const fullPath = `assets/faqs/${folderId}/answer.html`;
    return this.http.get(fullPath, { responseType: 'text' }).pipe(
      map((content: string) => {
        // Return exactly as-is - NO processing whatsoever
        return content;
      }),
      catchError((error: any) => {
        console.error('❌ Error loading raw HTML file for editing:', error);
        return of('<p>Error loading content</p>');
      })
    );
  }



  /**
   * Prepare content for editing - convert images to URL format for easier editing
   */
  private prepareContentForEditing(content: string): string {
    // Decode HTML entities first to show actual characters in the editor
    let prepared = this.decodeHTMLEntities(content);
    
    // For editor, clean up and convert images to URL format
    prepared = prepared
      // Remove potential security threats
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      // Clean up common browser-generated tags
      .replace(/<span[^>]*>\s*<\/span>/gi, '')
      .replace(/<div[^>]*>\s*<\/div>/gi, '')
      .trim();
    
    // Convert images to editable URL format for the editor
    prepared = this.convertImgsToUrls(prepared);
    
    return prepared;
  }

  /**
   * Decode HTML entities to actual characters (same as export service)
   */
  private decodeHTMLEntities(content: string): string {
    if (!content) return content;
    
    // Map of HTML entities to their corresponding characters
    const entityMap: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<', 
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',  // Convert to regular space
      '&mdash;': '—',
      '&ndash;': '–',
      '&hellip;': '…',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™'
    };
    
    let decoded = content;
    
    // Replace named entities
    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    
    // Handle numeric character references like &#39; &#8217; etc.
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });
    
    // Handle hexadecimal character references like &#x27; &#x2019; etc.
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    return decoded;
  }

  // Image Handling Functions
  
  /**
   * Convert <img> tags to editable URL format for editor display
   */
  private convertImgsToUrls(content: string): string {
    // Replace <img> tags with [IMG: url] format for easier editing
    return content.replace(/<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi, (match, src) => {
      return `<span class="image-url-placeholder" contenteditable="false">[IMG: ${src}]</span>`;
    });
  }
  
  /**
   * Convert [IMG: url] format back to <img> tags for preview and saving
   * Now supports temporary uploaded images
   */
  private convertUrlsToImgs(content: string, forExport: boolean = false): string {
    // First, replace [IMG: url] format with span tags back to <img> tags
    let result = content.replace(/<span[^>]*class=["']image-url-placeholder["'][^>]*>\[IMG:\s*([^\]]+)\]<\/span>/gi, (match, src) => {
      const imagePath = src.trim();
      
      if (forExport) {
        // For export, use the actual image path
        return `<img src="${imagePath}" >`;
      } else {
        // For preview, check if this is a temporary uploaded image
        const tempUrl = this.tempImageUrls.get(imagePath);
        if (tempUrl) {
          return `<img src="${tempUrl}" data-temp-path="${imagePath}" >`;
        }
        return `<img src="${imagePath}" >`;
      }
    });
    
    // Then, handle plain text [IMG: url] format (after span tags are removed by cleaning)
    result = result.replace(/\[IMG:\s*([^\]]+)\]/gi, (match, src) => {
      const imagePath = src.trim();
      
      if (forExport) {
        // For export, use the actual image path
        return `<img src="${imagePath}" >`;
      } else {
        // For preview, check if this is a temporary uploaded image
        const tempUrl = this.tempImageUrls.get(imagePath);
        if (tempUrl) {
          return `<img src="${tempUrl}" data-temp-path="${imagePath}" >`;
        }
        return `<img src="${imagePath}" >`;
      }
    });
    
    return result;
  }
  
  /**
   * Extract image URLs from content for validation
   */
  private extractImageUrls(content: string): string[] {
    const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    const urls: string[] = [];
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }
    
    return urls;
  }

  // Utility Functions
  
  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Basic URL validation
   */
  private isValidUrl(url: string): boolean {
    try {
      // Allow relative URLs, absolute URLs, and common protocols
      const urlPattern = /^(https?:\/\/|mailto:|tel:|#|\.?\/)/i;
      return url.length > 0 && (urlPattern.test(url) || url.startsWith('/') || url.startsWith('./') || url.startsWith('../'));
    } catch {
      return false;
    }
  }
  
  /**
   * Sanitize URL to prevent javascript: and other dangerous protocols
   */
  private sanitizeUrl(url: string): string {
    // Remove dangerous protocols
    const dangerousProtocols = /^(javascript|data|vbscript):/i;
    if (dangerousProtocols.test(url)) {
      return '#invalid-url';
    }
    return url;
  }

  // HTML Editor Enhancement Functions

  /**
   * Format HTML content using js-beautify
   */
  formatHTML(): void {
    const currentContent = this.getCurrentEditorContent();
    if (!currentContent.trim()) {
      this.notificationService.warning('No content to format');
      return;
    }

    try {
      let formatted = html_beautify(currentContent, {
        indent_size: 2,
        indent_level: 0,
        wrap_line_length: 100,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        indent_inner_html: false,
        unformatted: ['pre', 'code'],
        extra_liners: ['head', 'body', '/html']
      });
      
      // Remove any leading whitespace to prevent first-line indentation
      formatted = formatted.replace(/^\s+/, '');

      // Use execCommand to make the format operation undoable
      this.focusEditor();
      
      // Select all content
      document.execCommand('selectAll', false);
      
      // Insert the formatted content (this creates an undo point)
      document.execCommand('insertHTML', false, formatted);
      
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
      
      this.notificationService.success('HTML formatted successfully');
    } catch (error) {
      console.error('HTML formatting error:', error);
      this.notificationService.error('Failed to format HTML');
    }
  }


  /**
   * Wrap selected text with HTML tags using native commands
   */
  wrapSelectedText(startTag: string, endTag: string): void {
    // Focus the editor to ensure execCommand works
    this.focusEditor();

    // Map HTML tags to execCommand commands
    let command = '';
    
    if (startTag === '<strong>' && endTag === '</strong>') {
      command = 'bold';
    } else if (startTag === '<em>' && endTag === '</em>') {
      command = 'italic';
    } else if (startTag === '<u>' && endTag === '</u>') {
      command = 'underline';
    } else if (startTag === '<code>' && endTag === '</code>') {
      // Code formatting requires special handling
      this.toggleCodeFormat();
      return;
    }

    if (command) {
      try {
        // Execute the formatting command (automatically creates undo point)
        document.execCommand(command, false);
        
        // Mark as having changes
        this.state.hasChanges = true;
        this.state.saveError = null;
        
        // Update preview
        this.updatePreview();
        this.debouncedContentUpdate();
      } catch (error) {
        console.error('Formatting error:', error);
      }
    }
  }

  /**
   * Toggle code formatting (special case as execCommand doesn't support it)
   */
  private toggleCodeFormat(): void {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const selectedText = selection.toString();
      
      if (selectedText) {
        // Escape HTML to prevent code injection
        const escapedText = this.escapeHtml(selectedText);
        const codeHTML = `<code>${escapedText}</code>`;
        
        // Use insertHTML to make it undoable
        document.execCommand('insertHTML', false, codeHTML);
        
        this.state.hasChanges = true;
        this.updatePreview();
        this.debouncedContentUpdate();
      }
    }
  }


  /**
   * Insert a link with prompt for URL
   */
  insertLink(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.notificationService.warning('Please select text to create a link');
      return;
    }

    const selectedText = selection.toString();
    const url = prompt('Enter URL:', 'https://');
    if (url === null) return; // User cancelled
    
    // Validate and sanitize URL
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !this.isValidUrl(trimmedUrl)) {
      this.notificationService.warning('Please enter a valid URL');
      return;
    }
    
    const sanitizedUrl = this.sanitizeUrl(trimmedUrl);
    if (sanitizedUrl === '#invalid-url') {
      this.notificationService.warning('Invalid or dangerous URL detected');
      return;
    }

    try {
      // Escape HTML in link text to prevent XSS
      const linkText = selectedText || 'Link text';
      const escapedLinkText = this.escapeHtml(linkText);
      const escapedUrl = this.escapeHtml(sanitizedUrl);
      const linkHTML = `<a href="${escapedUrl}" target="_blank">${escapedLinkText}</a>`;
      
      // Use insertHTML to make it undoable
      document.execCommand('insertHTML', false, linkHTML);
      
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
      
      this.notificationService.success('Link inserted');
    } catch (error) {
      console.error('Link insertion error:', error);
      this.notificationService.error('Failed to insert link');
    }
  }

  /**
   * Insert a new paragraph
   */
  insertParagraph(): void {
    try {
      // Use insertHTML to make it undoable
      document.execCommand('insertHTML', false, '<p>&nbsp;</p>');
      
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
    } catch (error) {
      console.error('Paragraph insertion error:', error);
    }
  }

  /**
   * Insert a heading with selection for level
   */
  insertHeading(): void {
    const level = prompt('Enter heading level (1-6):', '2');
    if (level === null) return;

    const headingLevel = parseInt(level, 10);
    if (isNaN(headingLevel) || headingLevel < 1 || headingLevel > 6) {
      this.notificationService.warning('Please enter a number between 1 and 6');
      return;
    }

    const selection = window.getSelection();
    if (!selection) return;

    try {
      const selectedText = selection.toString();
      const headingText = selectedText || 'Heading text';
      // Escape HTML to prevent XSS
      const escapedHeadingText = this.escapeHtml(headingText);
      const headingHTML = `<h${headingLevel}>${escapedHeadingText}</h${headingLevel}>`;
      
      // Use insertHTML to make it undoable
      document.execCommand('insertHTML', false, headingHTML);
      
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
      
      this.notificationService.success(`H${headingLevel} heading inserted`);
    } catch (error) {
      console.error('Heading insertion error:', error);
      this.notificationService.error('Failed to insert heading');
    }
  }

  /**
   * Insert unordered list
   */
  insertUnorderedList(): void {
    this.focusEditor();
    document.execCommand('insertUnorderedList', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Insert ordered list
   */
  insertOrderedList(): void {
    this.focusEditor();
    document.execCommand('insertOrderedList', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Indent selected content
   */
  indent(): void {
    this.focusEditor();
    document.execCommand('indent', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Outdent selected content
   */
  outdent(): void {
    this.focusEditor();
    document.execCommand('outdent', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Clear all formatting from selected text
   */
  clearFormatting(): void {
    this.focusEditor();
    document.execCommand('removeFormat', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Align text left
   */
  alignLeft(): void {
    this.focusEditor();
    document.execCommand('justifyLeft', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Align text center
   */
  alignCenter(): void {
    this.focusEditor();
    document.execCommand('justifyCenter', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Align text right
   */
  alignRight(): void {
    this.focusEditor();
    document.execCommand('justifyRight', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Insert blockquote
   */
  insertBlockquote(): void {
    this.focusEditor();
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const selectedText = selection.toString() || 'Quote text';
      // Escape HTML to prevent XSS
      const escapedText = this.escapeHtml(selectedText);
      const quoteHTML = `<blockquote>${escapedText}</blockquote>`;
      document.execCommand('insertHTML', false, quoteHTML);
      
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
    }
  }

  /**
   * Insert horizontal rule
   */
  insertHorizontalRule(): void {
    this.focusEditor();
    document.execCommand('insertHorizontalRule', false);
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Insert table with specified rows and columns
   */
  insertTable(): void {
    const rowsInput = prompt('Enter total number of rows (including header):', '3');
    const colsInput = prompt('Enter number of columns:', '3');
    
    if (rowsInput === null || colsInput === null) return;
    
    const totalRows = parseInt(rowsInput, 10);
    const colCount = parseInt(colsInput, 10);
    
    // Validation
    if (isNaN(totalRows) || isNaN(colCount) || totalRows < 1 || colCount < 1) {
      this.notificationService.warning('Please enter valid numbers for rows and columns');
      return;
    }
    
    if (totalRows > 20 || colCount > 10) {
      this.notificationService.warning('Table size too large. Maximum: 20 rows x 10 columns');
      return;
    }
    
    // Build table HTML
    let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 1em 0;">';
    
    // Always include header row for better accessibility
    tableHTML += '<thead><tr>';
    for (let c = 0; c < colCount; c++) {
      const escapedHeader = this.escapeHtml(`Header ${c + 1}`);
      tableHTML += `<th style="padding: 8px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">${escapedHeader}</th>`;
    }
    tableHTML += '</tr></thead>';
    
    // Add data rows (total rows - 1 header row)
    const dataRows = Math.max(0, totalRows - 1);
    if (dataRows > 0) {
      tableHTML += '<tbody>';
      for (let r = 0; r < dataRows; r++) {
        tableHTML += '<tr>';
        for (let c = 0; c < colCount; c++) {
          const cellText = this.escapeHtml(`Cell ${r + 1},${c + 1}`);
          tableHTML += `<td style="padding: 8px; border: 1px solid #ddd;">${cellText}</td>`;
        }
        tableHTML += '</tr>';
      }
      tableHTML += '</tbody>';
    }
    
    tableHTML += '</table>';
    
    this.focusEditor();
    document.execCommand('insertHTML', false, tableHTML);
    
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
    
    const actualRows = Math.max(1, totalRows); // At least header row
    this.notificationService.success(`${actualRows}x${colCount} table inserted (1 header + ${dataRows} data rows)`);
  }

  // Undo/Redo System Integration


  /**
   * Perform undo operation using native browser undo
   */
  performUndo(): void {
    // Focus the editor first
    this.focusEditor();
    
    // Use native browser undo
    const success = document.execCommand('undo', false);
    
    if (success) {
      // Update content from DOM after undo
      this.editorContent = this.getCurrentEditorContent();
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
    } else {
      // Fallback to custom undo manager if native fails
      const previousState = this.undoRedoManager.undo();
      if (previousState) {
        // Set content without triggering change events
        this.setEditorContent(previousState.content);
        
        // Restore cursor position after DOM is updated
        setTimeout(() => {
          this.undoRedoManager.restoreSelection(previousState);
          this.focusEditor();
        }, 20);
      } else {
        this.notificationService.warning('Nothing to undo');
      }
    }
  }

  /**
   * Perform redo operation using native browser redo
   */
  performRedo(): void {
    // Focus the editor first
    this.focusEditor();
    
    // Use native browser redo
    const success = document.execCommand('redo', false);
    
    if (success) {
      // Update content from DOM after redo
      this.editorContent = this.getCurrentEditorContent();
      this.state.hasChanges = true;
      this.updatePreview();
      this.debouncedContentUpdate();
    } else {
      // Fallback to custom undo manager if native fails
      const nextState = this.undoRedoManager.redo();
      if (nextState) {
        // Set content without triggering change events
        this.setEditorContent(nextState.content);
        
        // Restore cursor position after DOM is updated
        setTimeout(() => {
          this.undoRedoManager.restoreSelection(nextState);
          this.focusEditor();
        }, 20);
      } else {
        this.notificationService.warning('Nothing to redo');
      }
    }
  }

  /**
   * Get undo/redo status for UI
   */
  getUndoRedoStatus(): { canUndo: boolean, canRedo: boolean, historySize: number } {
    return this.undoRedoManager.getHistoryInfo();
  }

  /**
   * Check if undo is available (always true with contenteditable)
   */
  canUndo(): boolean {
    // With native contenteditable, undo is usually available
    // We can't reliably check the native undo stack
    return true;
  }

  /**
   * Check if redo is available (always true with contenteditable)
   */
  canRedo(): boolean {
    // With native contenteditable, redo might be available
    // We can't reliably check the native redo stack
    return true;
  }

  /**
   * Initialize undo state when FAQ is loaded
   */
  private initializeUndoState(): void {
    // Native contenteditable handles its own undo history
    // We only need to clear any previous custom history
    this.undoRedoManager.clear();
  }

  /**
   * Clear undo history (call when switching FAQs)
   */
  private clearUndoHistory(): void {
    // Native contenteditable will reset its own history when content changes
    // Clear our fallback manager just in case
    this.undoRedoManager.clear();
  }

  // ========================
  // Tab Management Methods
  // ========================

  /**
   * Create a new FAQ tab
   */
  createNewTab(): void {
    const newFAQ: FAQItem & { isNew?: boolean } = {
      id: this.generateUUID(),
      question: 'New FAQ Question',
      category: this.categories.length > 0 ? this.categories[0] : 'General',
      folderId: '',
      answer: '',
      isNew: true
    };

    const tab: FAQTab = {
      id: this.generateUUID(),
      title: 'New FAQ',
      faq: newFAQ,
      hasChanges: false,
      isActive: true,
      editorContent: '',
      currentQuestion: newFAQ.question,
      currentCategory: newFAQ.category,
      currentSubCategory: '',
      currentIsActive: true
    };

    // Deactivate other tabs
    this.state.tabs.forEach(t => t.isActive = false);

    this.state.tabs.push(tab);
    this.state.activeTabId = tab.id;
    
    // Set current editing context
    this.state.selectedFAQ = newFAQ;
    this.editorContent = '<p></p>';
    this.currentQuestion = newFAQ.question;
    this.currentCategory = newFAQ.category;
    this.currentSubCategory = '';
    this.state.hasChanges = false;

    // Set default paragraph structure for new FAQ
    setTimeout(() => {
      if (this.htmlSourceEditor?.nativeElement) {
        this.htmlSourceEditor.nativeElement.innerHTML = '<p></p>';
        // Position cursor inside the paragraph
        this.positionCursorInParagraph();
      }
      this.clearUndoHistory();
      this.updatePreview();
      // Update external preview when regenerating content
      this.debouncedPreviewUpdate();
    }, 0);
  }

  /**
   * Select a tab and switch to it
   */
  selectTab(tabId: string): void {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Save current tab if has changes
    const currentTab = this.getCurrentTab();
    if (currentTab && currentTab.hasChanges) {
      this.saveCurrentTabContent();
    }

    // Switch to selected tab
    this.state.tabs.forEach(t => t.isActive = false);
    tab.isActive = true;
    this.state.activeTabId = tabId;

    // Load tab content
    this.loadTabContent(tab);
  }

  /**
   * Close a tab
   */
  closeTab(tabId: string): void {
    const tabIndex = this.state.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.state.tabs[tabIndex];

    // Confirm if has unsaved changes
    if (tab.hasChanges) {
      if (!confirm('This tab has unsaved changes. Close anyway?')) {
        return;
      }
    }

    // Remove tab
    this.state.tabs.splice(tabIndex, 1);

    // If was active tab, activate another
    if (tab.isActive && this.state.tabs.length > 0) {
      const newActiveIndex = Math.min(tabIndex, this.state.tabs.length - 1);
      this.selectTab(this.state.tabs[newActiveIndex].id);
    } else if (this.state.tabs.length === 0) {
      // No tabs left, clear the editor
      this.state.selectedFAQ = null;
      this.state.activeTabId = null;
      this.editorContent = '';
      this.currentQuestion = '';
      this.currentCategory = '';
      this.currentSubCategory = '';
      this.subCategories = [];
      this.state.hasChanges = false;
      if (this.htmlSourceEditor?.nativeElement) {
        this.htmlSourceEditor.nativeElement.innerHTML = '';
      }
      this.clearUndoHistory();
      this.previewContent = this.sanitizer.bypassSecurityTrustHtml('');
    }
  }

  /**
   * Load FAQ into a new tab or switch to existing tab
   */
  loadFAQToTab(faq: FAQItem): void {
    // Check if already open in a tab
    const existingTab = this.state.tabs.find(t => t.faq.id === faq.id);
    if (existingTab) {
      this.selectTab(existingTab.id);
      return;
    }

    // Create new tab
    const tab: FAQTab = {
      id: this.generateUUID(),
      title: faq.question.length > 30 ? faq.question.substring(0, 30) + '...' : faq.question,
      faq: faq,
      hasChanges: false,
      isActive: true,
      editorContent: '',
      currentQuestion: faq.question,
      currentCategory: faq.category,
      currentSubCategory: faq.subCategory || '',
      currentIsActive: faq.isActive !== false
    };

    // Deactivate other tabs
    this.state.tabs.forEach(t => t.isActive = false);

    this.state.tabs.push(tab);
    this.state.activeTabId = tab.id;

    // Load content into tab
    this.loadTabContent(tab);
  }

  /**
   * Load content into a tab
   */
  private loadTabContent(tab: FAQTab): void {
    this.state.selectedFAQ = tab.faq;
    this.state.isLoading = true;
    this.currentQuestion = tab.currentQuestion;
    this.currentCategory = tab.currentCategory;
    this.currentSubCategory = tab.currentSubCategory;
    this.currentIsActive = tab.currentIsActive;

    // Update subcategories for the selected category
    this.updateSubCategories();

    // Clear preview immediately
    this.previewContent = this.sanitizer.bypassSecurityTrustHtml('');

    // Clear undo history when switching tabs
    this.clearUndoHistory();

    // Load edited content if exists
    const edited = this.editedFAQs.get(tab.faq.id);
    if (edited) {
      const editableContent = this.convertImgsToUrls(edited.answer);
      this.editorContent = editableContent;
      tab.editorContent = editableContent;
      tab.currentQuestion = edited.question;
      tab.currentCategory = edited.category;
      tab.currentSubCategory = edited.subCategory || '';
      tab.currentIsActive = edited.isActive ?? true;
      this.currentQuestion = edited.question;
      this.currentCategory = edited.category;
      this.currentSubCategory = edited.subCategory || '';
      this.currentIsActive = edited.isActive ?? true;

      setTimeout(() => {
        if (this.htmlSourceEditor?.nativeElement) {
          this.htmlSourceEditor.nativeElement.innerHTML = editableContent;
        }
        this.state.isLoading = false;
        this.initializeUndoState();
        this.updatePreview();
        // Update external preview when switching to edited FAQ tab
        this.debouncedPreviewUpdate();
      }, 0);
    } else if ((tab.faq as any).isNew) {
      // New FAQ tab with default paragraph structure
      this.editorContent = '<p></p>';
      tab.editorContent = '<p></p>';
      
      setTimeout(() => {
        if (this.htmlSourceEditor?.nativeElement) {
          this.htmlSourceEditor.nativeElement.innerHTML = '<p></p>';
          // Position cursor inside the paragraph
          this.positionCursorInParagraph();
        }
        this.state.isLoading = false;
        this.initializeUndoState();
        this.updatePreview();
        // Update external preview when switching to new FAQ tab
        this.debouncedPreviewUpdate();
      }, 0);
    } else {
      // Load original content
      this.loadOriginalContentForTab(tab);
    }

    this.state.hasChanges = tab.hasChanges;
  }

  /**
   * Load original content for a tab
   */
  private loadOriginalContentForTab(tab: FAQTab): void {
    this.loadRawHTMLForEditing(tab.faq.folderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rawHtmlContent) => {
          const editableContent = this.prepareContentForEditing(rawHtmlContent);
          this.editorContent = editableContent;
          tab.editorContent = editableContent;

          setTimeout(() => {
            if (this.htmlSourceEditor?.nativeElement) {
              this.htmlSourceEditor.nativeElement.innerHTML = editableContent;
            }
            this.state.isLoading = false;
            this.initializeUndoState();
            this.updatePreview();
            // Update external preview when loading original content for tab
            this.debouncedPreviewUpdate();
          }, 0);
        },
        error: (error) => {
          console.error('Error loading original content for tab:', error);
          this.state.isLoading = false;
        }
      });
  }

  /**
   * Save current tab content
   */
  private saveCurrentTabContent(): void {
    const currentTab = this.getCurrentTab();
    if (currentTab && this.htmlSourceEditor?.nativeElement) {
      currentTab.editorContent = this.htmlSourceEditor.nativeElement.innerHTML;
      currentTab.currentQuestion = this.currentQuestion;
      currentTab.currentCategory = this.currentCategory;
      currentTab.currentSubCategory = this.currentSubCategory;
      currentTab.currentIsActive = this.currentIsActive;
      currentTab.hasChanges = this.state.hasChanges;
    }
  }

  /**
   * Get current active tab
   */
  private getCurrentTab(): FAQTab | undefined {
    return this.state.tabs.find(t => t.id === this.state.activeTabId);
  }

  /**
   * Override selectFAQ to use tab system
   */
  selectFAQOverride(faq: FAQItem): void {
    this.loadFAQToTab(faq);
  }

  /**
   * Handle tab changes - mark tab as changed
   */
  onTabContentChange(): void {
    const currentTab = this.getCurrentTab();
    if (currentTab) {
      currentTab.hasChanges = true;
      currentTab.editorContent = this.editorContent;
      currentTab.currentQuestion = this.currentQuestion;
      currentTab.currentCategory = this.currentCategory;
      currentTab.currentSubCategory = this.currentSubCategory;
      currentTab.currentIsActive = this.currentIsActive;
      
      // Update tab title if question changed
      if (this.currentQuestion && this.currentQuestion !== currentTab.faq.question) {
        currentTab.title = this.currentQuestion.length > 30 
          ? this.currentQuestion.substring(0, 30) + '...' 
          : this.currentQuestion;
      }
    }
  }

  /**
   * Generate UUID for tabs
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Track by function for tab iteration
   */
  trackByTabIndex(index: number): number {
    return index;
  }

  /**
   * Check if there are unsaved changes in any tab
   */
  hasUnsavedTabChanges(): boolean {
    return this.state.tabs.some(t => t.hasChanges);
  }

  /**
   * Clean editor content by removing unwanted elements and text using string operations
   * This avoids DOM manipulation that causes HTML entity encoding
   */
  private cleanEditorContent(content: string): string {
    if (!content) return content;
    
    let cleaned = content;
    
    // Remove unwanted text nodes that contain "faq-editor"
    cleaned = this.removeUnwantedTextNodesString(cleaned, 'faq-editor');
    
    // Remove all attributes from all elements except img src
    cleaned = this.removeUnwantedAttributesString(cleaned);
    
    // Remove ALL span tags while preserving their content
    cleaned = this.removeAllSpanTagsString(cleaned);
    
    // Remove any elements that might be editor-specific
    cleaned = this.removeEditorElementsString(cleaned);
    
    // Remove empty tags after cleaning (recursively)
    cleaned = this.removeEmptyTagsString(cleaned);
    
    return cleaned;
  }



  /**
   * String-based methods to avoid HTML entity encoding
   */
  
  private removeUnwantedTextNodesString(content: string, unwantedText: string): string {
    // Remove text content containing the unwanted text
    // This is a simplified version - in practice might need more sophisticated text node detection
    return content.replace(new RegExp(unwantedText, 'gi'), '');
  }
  
  private removeUnwantedAttributesString(content: string): string {
    // Remove all attributes from all tags except img src
    return content.replace(/<(\w+)([^>]*?)>/gi, (match, tagName, attributes) => {
      if (tagName.toLowerCase() === 'img') {
        // For img tags, only keep src attribute
        const srcMatch = attributes.match(/\s+src\s*=\s*["']([^"']*?)["']/i);
        if (srcMatch) {
          return `<${tagName} src="${srcMatch[1]}">`;
        }
        return `<${tagName}>`;
      } else {
        // For all other tags, remove all attributes
        return `<${tagName}>`;
      }
    });
  }
  
  private removeAllSpanTagsString(content: string): string {
    // Remove span tags but preserve their content
    return content.replace(/<\/?span[^>]*>/gi, '');
  }
  
  private removeEditorElementsString(content: string): string {
    // Remove editor-specific elements
    let cleaned = content;
    
    // Remove elements with editor-specific classes or attributes
    cleaned = cleaned.replace(/<[^>]*class\s*=\s*["'][^"']*(?:faq-editor|editor-|html-wysiwyg)[^"']*["'][^>]*>.*?<\/[^>]+>/gis, '');
    cleaned = cleaned.replace(/<[^>]*contenteditable[^>]*>.*?<\/[^>]+>/gis, '');
    
    return cleaned;
  }
  
  private removeEmptyTagsString(content: string): string {
    let cleaned = content;
    let hasChanges = false;
    
    do {
      hasChanges = false;
      const beforeLength = cleaned.length;
      
      // Remove empty tags (but preserve self-closing important tags)
      // First handle paired tags that are completely empty
      cleaned = cleaned.replace(/<((?!(?:br|hr|img|input|textarea|select|iframe|video|audio|canvas|svg|area|base|col|embed|link|meta|param|source|track|wbr)\b)\w+)[^>]*>\s*<\/\1>/gi, '');
      
      // Then handle tags that only contain whitespace or &nbsp;
      cleaned = cleaned.replace(/<((?!(?:br|hr|img|input|textarea|select|iframe|video|audio|canvas|svg|area|base|col|embed|link|meta|param|source|track|wbr)\b)\w+)[^>]*>(?:\s|&nbsp;)*<\/\1>/gi, '');
      
      hasChanges = cleaned.length !== beforeLength;
    } while (hasChanges);
    
    return cleaned;
  }


  /**
   * Position cursor inside the first paragraph for new FAQs
   */
  private positionCursorInParagraph(): void {
    if (!this.htmlSourceEditor?.nativeElement) return;
    
    try {
      const firstParagraph = this.htmlSourceEditor.nativeElement.querySelector('p');
      if (firstParagraph) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(firstParagraph, 0);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        
        // Focus the editor
        this.htmlSourceEditor.nativeElement.focus();
      }
    } catch (error) {
      console.warn('Could not position cursor in paragraph:', error);
    }
  }

  // ========================
  // Preview Mode Methods
  // ========================

  /**
   * Toggle between rendered preview and export source code view
   */
  togglePreviewMode(): void {
    this.state.previewMode = this.state.previewMode === 'rendered' ? 'source' : 'rendered';
  }

  /**
   * Get the HTML source code as it would appear in export
   * Uses the same cleaning logic as the actual export to ensure consistency
   */
  getExportSourceCode(): string {
    if (!this.htmlSourceEditor?.nativeElement) {
      return '<!-- No content loaded -->';
    }

    // Get raw editor content - same as in saveFAQ()
    const editorElement = this.htmlSourceEditor.nativeElement;
    const rawEditorContent = editorElement.innerHTML || this.editorContent;
    
    // First clean using component's method (removes editor-specific elements)
    const cleanedContent = this.cleanEditorContent(rawEditorContent);
    // Convert URL format back to img tags (use actual paths for source code preview)
    const withImages = this.convertUrlsToImgs(cleanedContent, true);
    
    // Then apply the same cleaning as export service for consistency
    const exportContent = this.exportService.cleanHTMLContent(withImages);
    
    // Apply HTML entity decoding to match actual export behavior
    const decodedContent = this.exportService.decodeHTMLEntities(exportContent);
    
    // Format for display (basic HTML formatting)
    return this.formatHTMLForDisplay(decodedContent);
  }

  /**
   * Format HTML content for readable display in source view
   */
  private formatHTMLForDisplay(content: string): string {
    if (!content) return '';
    
    try {
      // Use js-beautify to format the HTML for better readability
      return html_beautify(content, {
        indent_size: 2,
        indent_level: 0,
        wrap_line_length: 80,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        indent_inner_html: true,
        unformatted: ['pre', 'code'],
        extra_liners: ['head', 'body', '/html']
      });
    } catch (error) {
      console.warn('Error formatting HTML for display:', error);
      return content; // Return unformatted content if formatting fails
    }
  }

  // ========================
  // Image Upload Methods
  // ========================

  /**
   * Trigger image upload dialog
   */
  triggerImageUpload(): void {
    if (!this.state.selectedFAQ) {
      this.notificationService.warning('Please select an FAQ first');
      return;
    }
    this.imageInput.nativeElement.click();
  }

  /**
   * Handle image file selection
   */
  handleImageSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    
    // Validate file
    if (!this.validateImageFile(file)) {
      input.value = ''; // Clear the input
      return;
    }

    try {
      // Generate image reference path
      const imagePath = this.generateImageReference(file);
      
      // Store the file temporarily
      this.storeTemporaryImage(imagePath, file);
      
      // Insert image placeholder in editor
      this.insertImagePlaceholder(imagePath);
      
      this.notificationService.success('Image inserted successfully');
    } catch (error) {
      console.error('Error handling image selection:', error);
      this.notificationService.error('Failed to insert image');
    }

    // Clear the input for next selection
    input.value = '';
  }

  /**
   * Validate image file (size, type, etc.)
   */
  private validateImageFile(file: File): boolean {
    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      this.notificationService.warning('Please select a valid image file (JPG, PNG, GIF, WEBP)');
      return false;
    }

    // Check file size (2MB limit)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      this.notificationService.warning('Image size must be less than 2MB');
      return false;
    }

    return true;
  }

  /**
   * Generate image reference path. The folderId is the canonical FAQ slug
   * and is also the folder name on disk under assets/faqs/.
   */
  private generateImageReference(file: File): string {
    if (!this.state.selectedFAQ) {
      throw new Error('No FAQ selected');
    }

    let folderId: string;

    // Use folderId if available (for existing FAQs)
    if (this.state.selectedFAQ.folderId) {
      folderId = this.state.selectedFAQ.folderId;
    } else {
      // For new FAQs without a folderId yet, derive from question title
      const questionTitle = this.currentQuestion || this.state.selectedFAQ.question;
      if (!questionTitle || !questionTitle.trim()) {
        throw new Error('FAQ question title is required for image naming');
      }
      folderId = this.generateSlugFromTitle(questionTitle);
    }

    const fileExtension = this.getFileExtension(file.name);
    const sequence = this.getNextImageSequence(folderId);

    return `assets/faqs/${folderId}/images/${folderId}-${sequence}.${fileExtension}`;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'jpg';
  }

  /**
   * Convert question title to slug format for consistent naming
   */
  private generateSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters except spaces and hyphens
      .trim()
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/-+/g, '-')           // Merge multiple hyphens
      .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
      .substring(0, 50);             // Limit length to 50 characters
  }

  /**
   * Get next available image sequence number for the given FAQ folderId.
   * Looks at existing temp images stored under assets/faqs/<folderId>/images/.
   */
  private getNextImageSequence(folderId: string): number {
    let maxSequence = 0;

    const seqRegex = new RegExp(`/${folderId}/images/${folderId}-(\\d+)\\.`);
    for (const path of this.tempImageMap.keys()) {
      const match = path.match(seqRegex);
      if (match) {
        const sequence = parseInt(match[1], 10);
        maxSequence = Math.max(maxSequence, sequence);
      }
    }

    return maxSequence + 1;
  }

  /**
   * Store image file temporarily with generated path
   */
  private storeTemporaryImage(imagePath: string, file: File): void {
    // Store the file
    this.tempImageMap.set(imagePath, file);
    
    // Create object URL for preview
    const objectUrl = URL.createObjectURL(file);
    this.tempImageUrls.set(imagePath, objectUrl);
    
  }

  /**
   * Insert image placeholder in the editor
   */
  private insertImagePlaceholder(imagePath: string): void {
    this.focusEditor();
    
    // Create image placeholder in the format expected by existing system
    const placeholder = `<span class="image-url-placeholder" contenteditable="false">[IMG: ${imagePath}]</span>`;
    
    // Use execCommand to make it undoable
    document.execCommand('insertHTML', false, placeholder);
    
    this.state.hasChanges = true;
    this.updatePreview();
    this.debouncedContentUpdate();
  }

  /**
   * Clean up temporary image URLs to prevent memory leaks
   */
  private cleanupTempImageUrls(): void {
    for (const url of this.tempImageUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.tempImageUrls.clear();
  }

  /**
   * Get temporary images for export
   */
  getTempImages(): Map<string, File> {
    return this.tempImageMap;
  }

  // ========================
  // Preview in New Tab Methods
  // ========================

  /**
   * Open preview in new tab with export-ready content
   */
  openPreviewInNewTab(): void {
    if (!this.state.selectedFAQ) {
      this.notificationService.warning('Please select an FAQ to preview');
      return;
    }

    // Get raw editor content - same as in saveFAQ()
    const editorElement = this.htmlSourceEditor?.nativeElement;
    const rawEditorContent = editorElement?.innerHTML || this.editorContent;
    
    // Clean the content using same logic as export
    const cleanedContent = this.cleanEditorContent(rawEditorContent);
    
    // Convert URL format back to img tags (use blob URLs for preview)
    const htmlWithImages = this.convertUrlsToImgs(cleanedContent, false);
    
    // Apply export service cleaning for consistency
    const exportReadyContent = this.exportService.cleanHTMLContent(htmlWithImages);
    
    // Prepare preview data
    const previewData: PreviewData = {
      faqId: this.state.selectedFAQ.id,
      question: this.currentQuestion || this.state.selectedFAQ.question,
      category: this.currentCategory || this.state.selectedFAQ.category,
      subCategory: this.currentSubCategory || this.state.selectedFAQ.subCategory || undefined,
      htmlContent: exportReadyContent,
      timestamp: Date.now()
    };

    // Open preview in new tab
    const result = this.previewService.openPreviewInNewTab(
      this.state.selectedFAQ.id,
      previewData
    );

    if (result.success) {
      this.notificationService.success('Preview opened in new tab');
    } else {
      // Popup was blocked, show fallback dialog
      this.showPreviewFallbackDialog(result.url!);
    }
  }

  /**
   * Debounced version of preview update to prevent excessive cross-tab communication
   */
  private debouncedPreviewUpdate(): void {
    if (this.previewUpdateTimer) {
      clearTimeout(this.previewUpdateTimer);
    }
    
    this.previewUpdateTimer = setTimeout(() => {
      this.updatePreviewIfOpen();
    }, 500); // 500ms debounce
  }

  /**
   * Update preview if tab is open (called on save)
   */
  private updatePreviewIfOpen(): void {
    if (!this.state.selectedFAQ) return;

    // Get raw editor content
    const editorElement = this.htmlSourceEditor?.nativeElement;
    const rawEditorContent = editorElement?.innerHTML || this.editorContent;
    
    // Clean and process content
    const cleanedContent = this.cleanEditorContent(rawEditorContent);
    const htmlWithImages = this.convertUrlsToImgs(cleanedContent, false);
    const exportReadyContent = this.exportService.cleanHTMLContent(htmlWithImages);
    
    // Update preview data
    const previewData: PreviewData = {
      faqId: this.state.selectedFAQ.id,
      question: this.currentQuestion || this.state.selectedFAQ.question,
      category: this.currentCategory || this.state.selectedFAQ.category,
      subCategory: this.currentSubCategory || this.state.selectedFAQ.subCategory || undefined,
      htmlContent: exportReadyContent,
      timestamp: Date.now()
    };

    // Update preview (will notify open tabs via storage event)
    this.previewService.updatePreviewData(previewData);
  }

  /**
   * Get export-ready preview content (used by both preview methods)
   */
  getExportReadyPreviewContent(): string {
    if (!this.htmlSourceEditor?.nativeElement) {
      return '';
    }

    // Get raw editor content
    const editorElement = this.htmlSourceEditor.nativeElement;
    const rawEditorContent = editorElement.innerHTML || this.editorContent;
    
    // Apply all cleaning steps
    const cleanedContent = this.cleanEditorContent(rawEditorContent);
    const htmlWithImages = this.convertUrlsToImgs(cleanedContent, true);
    const exportContent = this.exportService.cleanHTMLContent(htmlWithImages);
    const decodedContent = this.exportService.decodeHTMLEntities(exportContent);
    
    return decodedContent;
  }

  /**
   * Show fallback dialog when popup is blocked
   */
  showPreviewFallbackDialog(previewUrl: string): void {
    const fullUrl = window.location.origin + previewUrl;
    
    // Create fallback dialog content
    const dialogHTML = `
      <div class="preview-fallback-dialog">
        <h3>Preview Blocked by Browser</h3>
        <p>Your browser blocked the popup window. You can open the preview using one of these options:</p>
        
        <div class="fallback-options">
          <button class="btn btn-primary" onclick="window.open('${previewUrl}', '_blank'); this.closest('.preview-fallback-overlay').remove();">
            Try Opening Again
          </button>
          
          <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${fullUrl}').then(() => alert('URL copied to clipboard!')); this.closest('.preview-fallback-overlay').remove();">
            Copy URL
          </button>
          
          <button class="btn btn-secondary" onclick="window.location.href = '${previewUrl}';">
            Open in Current Tab
          </button>
        </div>
        
        <div class="url-display">
          <label>Preview URL:</label>
          <input type="text" readonly value="${fullUrl}" onclick="this.select();" style="width: 100%; margin-top: 0.5rem; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div class="dialog-footer">
          <button class="btn btn-sm btn-outline-secondary" onclick="this.closest('.preview-fallback-overlay').remove();">
            Cancel
          </button>
          <small style="margin-left: 1rem; color: #666;">
            To avoid this in the future, please allow popups for this site.
          </small>
        </div>
      </div>
    `;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'preview-fallback-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    `;
    
    dialog.innerHTML = dialogHTML;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Add styles for dialog content
    const style = document.createElement('style');
    style.textContent = `
      .preview-fallback-dialog h3 {
        margin-top: 0;
        color: #333;
        margin-bottom: 1rem;
      }
      .preview-fallback-dialog p {
        color: #666;
        margin-bottom: 1.5rem;
        line-height: 1.5;
      }
      .fallback-options {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .fallback-options .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
      }
      .fallback-options .btn-primary {
        background: #007bff;
        color: white;
      }
      .fallback-options .btn-primary:hover {
        background: #0056b3;
      }
      .fallback-options .btn-secondary {
        background: #6c757d;
        color: white;
      }
      .fallback-options .btn-secondary:hover {
        background: #545b62;
      }
      .url-display {
        margin-bottom: 1.5rem;
      }
      .url-display label {
        font-weight: 500;
        color: #333;
        display: block;
      }
      .dialog-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid #eee;
        padding-top: 1rem;
        margin-top: 1rem;
      }
      .dialog-footer .btn-outline-secondary {
        background: transparent;
        color: #6c757d;
        border: 1px solid #6c757d;
        padding: 0.25rem 0.75rem;
      }
      .dialog-footer .btn-outline-secondary:hover {
        background: #6c757d;
        color: white;
      }
    `;
    document.head.appendChild(style);

    // Show warning notification
    this.notificationService.warning('Preview blocked - see dialog for options');
  }
}