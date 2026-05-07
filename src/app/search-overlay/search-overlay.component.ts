import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  ViewChild,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FAQMetadata } from '../shared/models/faq.model';
import { FAQService } from '../shared/services/faq.service';

interface FaqItem {
  id: string;
  question: string;
  route: string;
  category: string;
  subCategory: string | null;
  tags: string[];
}
export interface SelectedSuggestion extends FaqItem {
  subCatFilterApplied: boolean;
}

@Component({
  selector: 'app-search-overlay',
  templateUrl: './search-overlay.component.html',
  styleUrls: ['./search-overlay.component.scss'],
})
export class SearchOverlayComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() initialQuery = ''; 
  @Output() closed = new EventEmitter<void>();
  @Output() selectedResult = new EventEmitter<FaqItem>();
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  searchQuery = '';

  selectedCategory: string = '';
  selectedSubCategories: string[] = [];

  categories: string[] = [];
  subCategories: string[] = [];
  isLoading = true;
  loadError = false;

  suggestions: FaqItem[] = [];
  filteredSuggestions: FaqItem[] = [];
  
  // Cache for FAQ answer text content
  private answerTexts: Map<string, string> = new Map();

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private faqService: FAQService
  ) {}

  ngOnInit() {
    // Single GET — assets/faqs/faqs.json holds the full metadata list.
    this.http.get<{ faqs: FAQMetadata[] }>('assets/faqs/faqs.json').subscribe({
      next: (idx) => {
        const entries = (idx?.faqs || []).filter(meta => meta.isActive !== false);
        this.suggestions = entries.map(meta => ({
          id: meta.id,
          question: meta.question,
          route: meta.folderId,
          category: meta.category,
          subCategory: meta.subCategory ?? null,
          tags: meta.subCategory
            ? [meta.category, meta.subCategory]
            : [meta.category],
        }));
        this.categories = [...new Set(this.suggestions.map((i) => i.category))];
        this.filterSubCategoryList();
        this.filterSuggestions();
        this.isLoading = false;

        // Load answer texts asynchronously for search
        this.loadAnswerTexts();

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading FAQs:', error);
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

  onSelectSuggestion(item: FaqItem) {
    const subCatFilterApplied = this.selectedSubCategories.length > 0;

    this.selectedResult.emit({
      ...item,
      subCatFilterApplied,
    } as SelectedSuggestion);

    this.close();
  }

  selectCategory(cat: string) {
    this.selectedCategory = this.selectedCategory === cat ? '' : cat;
    this.filterSubCategoryList();
    this.filterSuggestions();
  }

  toggleSubCategory(sc: string) {
    const i = this.selectedSubCategories.indexOf(sc);
    i >= 0
      ? this.selectedSubCategories.splice(i, 1)
      : this.selectedSubCategories.push(sc);
    this.filterSuggestions();
  }

  filterSubCategoryList() {
    if (!this.selectedCategory) {
      this.subCategories = [];
      this.selectedSubCategories = [];
      return;
    }
    const subs = this.suggestions
      .filter((i) => i.category === this.selectedCategory && i.subCategory)
      .map((i) => i.subCategory!);
    this.subCategories = [...new Set(subs)];
    this.selectedSubCategories = this.selectedSubCategories.filter((s) =>
      this.subCategories.includes(s)
    );
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedSubCategories = [];
    this.subCategories = [];
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
    const kw = this.searchQuery.trim().toLowerCase();

    // Filter and add priority information
    const filteredWithPriority = this.suggestions
      .filter((i) => {
        // Search in question
        const matchQuestion = kw ? i.question.toLowerCase().includes(kw) : true;

        // Search in answer content
        const answerText = this.answerTexts.get(i.id) || '';
        const matchAnswer = kw ? answerText.includes(kw) : false;

        // Match keyword in either question or answer
        const matchKW = !kw || matchQuestion || matchAnswer;

        const matchCat =
          !this.selectedCategory || i.category === this.selectedCategory;

        const matchSub =
          this.selectedSubCategories.length === 0 ||
          (i.subCategory && this.selectedSubCategories.includes(i.subCategory));

        return matchKW && matchCat && matchSub;
      })
      .map((i) => {
        // Add priority based on match type
        let priority = 999; // Default lowest priority

        if (kw) {
          // Category match - priority 1 (highest)
          if (i.category.toLowerCase().includes(kw)) {
            priority = 1;
          }
          // SubCategory match - priority 2
          else if (i.subCategory && i.subCategory.toLowerCase().includes(kw)) {
            priority = 2;
          }
          // Question match - priority 3
          else if (i.question.toLowerCase().includes(kw)) {
            priority = 3;
          }
          // Answer match - priority 4 (lowest)
          else if (this.answerTexts.get(i.id)?.toLowerCase().includes(kw)) {
            priority = 4;
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

        // Same category, group by subCategory
        const aSubCat = a.item.subCategory || '';
        const bSubCat = b.item.subCategory || '';
        if (aSubCat !== bSubCat) {
          return aSubCat.localeCompare(bSubCat);
        }

        // Finally, sort alphabetically by question within same category/subcategory
        return a.item.question.localeCompare(b.item.question);
      })
      .map(result => result.item); // Return only the FAQ items

    this.filteredSuggestions = filteredWithPriority;
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.searchQuery.trim() ||
      this.selectedCategory ||
      this.selectedSubCategories.length > 0
    );
  }
  
  /**
   * Load and extract text from all FAQ answer HTML files
   */
  private async loadAnswerTexts(): Promise<void> {
    const loadPromises = this.suggestions.map(async (faq) => {
      try {
        const htmlPath = this.faqService.getAnswerHtmlUrl(faq.route);
        const response = await fetch(htmlPath);
        
        if (response.ok) {
          const html = await response.text();
          const cleanText = this.extractTextFromHTML(html);
          this.answerTexts.set(faq.id, cleanText);
        }
      } catch (error) {
        // Silently handle errors for individual files
        console.warn(`Failed to load answer for FAQ ${faq.id}:`, error);
      }
    });
    
    // Load all answers in parallel
    await Promise.all(loadPromises);
    
    // Re-filter suggestions if search query exists
    if (this.searchQuery.trim()) {
      this.filterSuggestions();
      this.cdr.detectChanges();
    }
  }
  
  /**
   * Extract clean text from HTML content for searching
   */
  private extractTextFromHTML(html: string): string {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remove script and style elements
    const scripts = tempDiv.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());
    
    // Remove img elements as they don't contain searchable text
    const images = tempDiv.querySelectorAll('img');
    images.forEach(el => el.remove());
    
    // Get text content
    let text = tempDiv.textContent || tempDiv.innerText || '';
    
    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n{2,}/g, '\n')  // Replace multiple newlines with single newline
      .trim()
      .toLowerCase();  // Convert to lowercase for case-insensitive search
    
    return text;
  }
}
