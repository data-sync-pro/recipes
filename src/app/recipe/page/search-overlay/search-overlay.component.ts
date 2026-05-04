import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CacheService } from '../../core/services/cache.service';
import { SearchService } from '../../core/services/search.service';
import { LoggerService } from '../../core/services/logger.service';

// Search-specific item structure for the overlay
interface RecipeSearchItem {
  id: string;
  slug?: string;
  question: string;
  route: string;
  category: string;
  subCategory: string | null;
  tags: string[];
  searchableContent: string; // Combined content for searching
}

export interface SelectedSuggestion extends RecipeSearchItem {
  subCatFilterApplied: boolean;
}

@Component({
  selector: 'app-recipe-search-overlay',
  templateUrl: './search-overlay.component.html',
  styleUrls: ['./search-overlay.component.scss'],
})
export class RecipeSearchOverlayComponent implements OnInit, OnDestroy, OnChanges {
  private destroy$ = new Subject<void>();

  @Input() isOpen = false;
  @Input() initialQuery = '';
  @Output() closed = new EventEmitter<void>();
  @Output() selectedResult = new EventEmitter<SelectedSuggestion>();
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  searchQuery = '';

  selectedCategory: string = '';

  categories: string[] = [];
  isLoading = true;
  loadError = false;

  suggestions: RecipeSearchItem[] = [];
  filteredSuggestions: RecipeSearchItem[] = [];
  selectedIndex: number = -1;

  constructor(
    private cdr: ChangeDetectorRef,
    private cacheService: CacheService,
    private searchService: SearchService,
    private logger: LoggerService
  ) {}

  ngOnInit() {
    this.loadRecipes();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRecipes() {
    this.isLoading = true;
    this.loadError = false;

    this.cacheService.getRecipes$()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (recipes) => {
          this.suggestions = recipes
            .filter(r => r.id) // Only include recipes with valid IDs
            .map((r) => {
              // Build searchable content from all relevant fields
              const contentParts = [
                r.overview || '',
                r.generalUseCase || '',
                r.pipeline || '',
                r.direction || '',
                r.connection || '',
                ...(r.keywords || []),
                ...(r.walkthrough || []).map(step => step.step)
              ];

              const firstCategory = r.category[0] || '';
              return {
                id: r.id,
                slug: r.slug,
                question: r.title,
                route: `/recipes/${encodeURIComponent(firstCategory)}/${r.slug}`,
                category: firstCategory,
                subCategory: null,
                tags: r.category,  // Use all categories as tags
                searchableContent: contentParts.join(' ').toLowerCase()
              };
            });

          this.categories = this.searchService.sortCategoryNames([...new Set(this.suggestions.map((i) => i.category))]);
          this.filterSuggestions();
          this.isLoading = false;

          this.cdr.detectChanges();
        },
        error: (error) => {
          this.logger.error('Error loading recipes', error);
          this.loadError = true;
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen) this.close();
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(event: Event) {
    if (!this.isOpen || !this.filteredSuggestions.length) return;
    event.preventDefault();
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredSuggestions.length - 1);
    this.scrollToSelectedItem();
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(event: Event) {
    if (!this.isOpen || !this.filteredSuggestions.length) return;
    event.preventDefault();
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.scrollToSelectedItem();
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: Event) {
    if (!this.isOpen || this.selectedIndex < 0 || this.selectedIndex >= this.filteredSuggestions.length) return;
    event.preventDefault();
    this.onSelectSuggestion(this.filteredSuggestions[this.selectedIndex]);
  }

  private scrollToSelectedItem(): void {
    setTimeout(() => {
      const selectedElement = document.querySelector('.suggestion-item.active');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  onSelectSuggestion(item: RecipeSearchItem) {
    this.selectedResult.emit({
      ...item,
      subCatFilterApplied: false,
    } as SelectedSuggestion);

    this.close();
  }

  selectCategory(cat: string) {
    this.selectedCategory = this.selectedCategory === cat ? '' : cat;
    this.filterSuggestions();
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.filterSuggestions();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']?.currentValue) {
      
      if (changes['initialQuery'] || this.initialQuery) {
        this.searchQuery = this.initialQuery;
        
        setTimeout(() => {
          this.filterSuggestions();
        }, 0);
      }
      
      // Immediate focus without delay to improve responsiveness
      setTimeout(() => {
        this.searchInputRef?.nativeElement?.focus();
        
        if (this.searchQuery) {
          this.searchInputRef?.nativeElement?.select();
        }
      }, 0);
    }
    
    
    if (changes['initialQuery'] && !changes['isOpen']) {
      this.searchQuery = this.initialQuery;
      this.filterSuggestions();
    }
  }

  close() {
    this.closed.emit();
  }

  filterSuggestions() {
    this.selectedIndex = -1; // Reset selection when filtering
    const kw = this.searchQuery.trim().toLowerCase();

    // Filter and add priority information
    const filteredWithPriority = this.suggestions
      .filter((i) => {
        // Search in recipe title and content
        const matchQuestion = kw ?
          i.question.toLowerCase().includes(kw) || i.searchableContent.includes(kw) :
          true;

        const matchCat =
          !this.selectedCategory || i.category === this.selectedCategory;

        return matchQuestion && matchCat;
      })
      .map((i) => {
        // Add priority based on match type
        let priority = 999; // Default lowest priority

        if (kw) {
          // Category match - priority 1 (highest)
          if (i.category.toLowerCase().includes(kw)) {
            priority = 1;
          }
          // Recipe title match - priority 2
          else if (i.question.toLowerCase().includes(kw)) {
            priority = 2;
          }
          // Content match - priority 3
          else if (i.searchableContent.includes(kw)) {
            priority = 3;
          }
        }

        return { item: i, priority };
      })
      .sort((a, b) => {
        // Sort by priority first
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        // Same priority, group by category first
        if (a.item.category !== b.item.category) {
          return a.item.category.localeCompare(b.item.category);
        }

        // Finally, sort alphabetically by recipe title within same category
        return a.item.question.localeCompare(b.item.question);
      })
      .map(result => result.item); // Return only the recipe items

    this.filteredSuggestions = filteredWithPriority;
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.searchQuery.trim() ||
      this.selectedCategory
    );
  }

}