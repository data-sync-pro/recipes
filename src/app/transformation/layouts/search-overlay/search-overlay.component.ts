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
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { buildRoute, categorySlug } from 'src/app/transformation/utils/route.util';
import { SidebarService } from 'src/app/transformation/services/sidebar.service';
@Component({
  selector: 'app-search-overlay',
  templateUrl: './search-overlay.component.html',
  styleUrls: ['./search-overlay.component.css'],
})
export class SearchOverlayComponent implements OnInit, OnChanges, OnDestroy {
  @Input() isOpen: boolean = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  searchQuery: string = '';
  selectedTags: string[] = [];
  tags: string[] = [];
  suggestions: any[] = [];
  filteredSuggestions: any[] = [];
  selectedIndex: number = -1;

  // Track pending UI timers so we can cancel them on destroy
  private focusTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient, private router: Router,private sidebarService: SidebarService) {}


  ngOnInit() {
    this.http.get<any[]>('assets/transformation/formulas/tags.json').subscribe((data) => {
      this.suggestions = data.map((item) => ({
        name: item['Item Name'],
        Tags: item['Tags'],
        route: buildRoute(item['Item Name']),
      }));

      this.http
        .get<any>('assets/transformation/formulas/global_variables.json')
        .subscribe((gvData) => {
          (gvData.globalVariables ?? gvData ?? []).forEach((gv: any) => {
            const name = gv.variable ?? '';
            this.suggestions.push({
              name,
              Tags: ['Global Variables'],
              route: `global_variables`,
            });
          });

          const tagSet = new Set<string>();
          this.suggestions.forEach((item) =>
            item.Tags.forEach((tag: string) => tagSet.add(tag))
          );
          this.tags = Array.from(tagSet);

          const preferredOrder = [
            'Text',
            'Logical',
            'Number',
            'Date & Time',
            'Operators',
            'Global Variables',
            'Randomization',
            'Type Processing',
            'Trigger',
            'Advanced',
          ];
          this.tags.sort((a, b) => {
            const aIndex = preferredOrder.indexOf(a);
            const bIndex = preferredOrder.indexOf(b);

            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
            return aIndex === -1 ? 1 : -1;
          });
        });
    });
  }

  onSelectSuggestion(item: any) {
    const isGlobalVariableItem =
    Array.isArray(item.Tags) && item.Tags.includes('Global Variables');

    const isSpecialName =
      item.name === 'OPERATORS' ||
      item.name === 'APEX_CLASS';

    if (isGlobalVariableItem) {
      if (item.name.toUpperCase() === '$JOINER') {
        this.sidebarService.setActiveCategory('Global Variables');
        this.router.navigate(['/transformation', 'joiner']);
      } else {
        this.sidebarService.setActiveCategory('');
        this.router.navigate(['/transformation', 'global_variables']);
      }
    } else if (isSpecialName) {
      this.sidebarService.setActiveCategory('');
      this.router.navigate(['/transformation', item.route]);
    } else {
      this.router.navigate(['/transformation', categorySlug(item.Tags[0]), item.route]);
    }

    this.close();
  }

  toggleTag(tag: string) {
    const i = this.selectedTags.indexOf(tag);
    i >= 0 ? this.selectedTags.splice(i, 1) : this.selectedTags.push(tag);
    this.filterSuggestions();
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedTags = [];
    this.filterSuggestions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue === true) {
      if (this.focusTimeoutId !== null) {
        clearTimeout(this.focusTimeoutId);
      }
      this.focusTimeoutId = setTimeout(() => {
        this.focusTimeoutId = null;
        this.searchInputRef?.nativeElement?.focus();
      }, 0);
      this.selectedIndex = -1;
    }
  }

  ngOnDestroy(): void {
    if (this.focusTimeoutId !== null) {
      clearTimeout(this.focusTimeoutId);
      this.focusTimeoutId = null;
    }
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
      this.scrollTimeoutId = null;
    }
  }

  close() {
    this.closed.emit();
  }

  trackByString(_: number, value: string): string {
    return value;
  }

  trackBySuggestionName(_: number, item: { name: string }): string {
    return item.name;
  }

  filterSuggestions() {
    const query = this.searchQuery.trim().toLowerCase();

    if(query) {
      // when there is input, only return functions with a matching name
      this.filteredSuggestions = this.suggestions.filter((item) => {
        const itemTags = item.Tags || [];
        const isNameMatch = item.name.toLowerCase().includes(query);
        const matchesSelectedTags =
          this.selectedTags.length === 0 ||
          this.selectedTags.some((tag: string) => itemTags.includes(tag));
        return isNameMatch && matchesSelectedTags;
      }).sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(query);
        const bStarts = bName.startsWith(query);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

       
        return aName.indexOf(query) - bName.indexOf(query);
      }
      );
    } else {
      this.filteredSuggestions = this.suggestions.filter((item) => {
        const itemTags = item.Tags || [];
        return (
          this.selectedTags.length === 0 ||
          this.selectedTags.some((tag: string) => itemTags.includes(tag))
        );
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        const aDollar = aName.startsWith('$');
        const bDollar = bName.startsWith('$');
        if (aDollar && !bDollar) return 1;
        if (!aDollar && bDollar) return -1;

        return aName.localeCompare(bName);
      });
    }
    this.selectedIndex = -1;
  }

  getVisibleSuggestions() {
    return this.filteredSuggestions.filter(item => item.name !== 'GLOBAL_VARIABLES');
  }

  onKeyDown(event: KeyboardEvent) {
    const visibleSuggestions = this.getVisibleSuggestions();
    
    if (visibleSuggestions.length === 0) {
      return;
    }

    switch(event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, visibleSuggestions.length - 1);
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.scrollToSelected();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < visibleSuggestions.length) {
          this.onSelectSuggestion(visibleSuggestions[this.selectedIndex]);
        }
        break;
    }
  }

  private scrollToSelected() {
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
    }
    this.scrollTimeoutId = setTimeout(() => {
      this.scrollTimeoutId = null;
      const selected = document.querySelector('.suggestion-item.selected');
      if (selected) {
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  }
}
  