import { Component, OnInit, OnDestroy, Output, EventEmitter, Input, ViewChild, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject, Subscription, Observable } from 'rxjs';
import { SidebarService } from 'src/app/transformation/services/sidebar.service';
import { buildRoute, categoryNameFromSlug, categorySlug } from 'src/app/transformation/utils/route.util';
import { SearchBoxComponent } from '../search-box/search-box.component';

interface FunctionItem {
  'Item Name': string;
  Tags: string[];
}

// A unique function for the flat search results: name, its tags (for matching)
// and the route segment of its detail page.
interface SearchableFunction {
  name: string;
  route: string;
  tags: string[];
}

// A single row in the flat search results list (function or special page).
interface NavSearchResult {
  name: string;
  link: string[];
}

interface FunctionCategory {
  name: string;
  expanded: boolean;
  functions: { name: string; route: string }[];
  // Extra lowercased text matched by the sidebar filter but never displayed.
  // Used to make the Home entry findable by the overview content it renders
  // (the "Elements of a Formula" section), not just its "Home" label.
  searchText?: string;
}

const SPECIAL_ROUTES: Record<string, string> = {
  Home: 'home',
  Operators: 'operators',
  'Global Variables': 'global_variables',
  'Apex Class': 'apex_class',
};

// Pseudo function entries in tags.json that stand in for the special pages —
// excluded from the flat function list (they surface as special-page rows).
const SPECIAL_ITEM_NAMES = new Set(['OPERATORS', 'GLOBAL_VARIABLES', 'APEX_CLASS']);

// Tags that map to special pages rather than a function category; skipped when
// choosing a function's primary category for its detail-page link.
const SPECIAL_TAGS = new Set(['Operators', 'Global Variables', 'Apex Class']);

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit, OnDestroy {
  @Input() collapsed$!: Observable<boolean>;
  @Output() toggleSidebar = new EventEmitter<void>();
  // Fired whenever a nav entry navigates, so the host can close the mobile drawer.
  @Output() linkClick = new EventEmitter<void>();

  // Undefined while the sidebar is collapsed (the search box is *ngIf'd out),
  // so the `/` shortcut is a no-op until the sidebar is expanded.
  @ViewChild(SearchBoxComponent) private searchBox?: SearchBoxComponent;

  // Exposed for template use in [routerLink].
  categorySlug = categorySlug;

  private destroy$ = new Subject<void>();
  // Cache the latest active category so updateActiveCategory() can read it
  // synchronously instead of resubscribing to the observable on every nav.
  private currentActiveCategory: string = '';
  operatorExpand = false;
  globalVariableExpand = false;
  apexClassExpand = false;
  // Name of the category that contains the active page; drives the brand
  // highlight on its header (setup's .in-path state). Distinct from
  // category.expanded, which the user can also toggle manually.
  activeCategoryName = '';
  functionCategories: FunctionCategory[] = [];
  // Deduped, flat list of every function (each appears once even when it has
  // multiple tags) — the source for the flat search results.
  private allFunctions: SearchableFunction[] = [];
  searchQuery = '';
  // Flat, deduped search results shown in place of the category tree while a
  // query is active, so a multi-tag function appears once instead of per tag.
  searchResults: NavSearchResult[] = [];
  // Lowercased blob of the Home page's overview content, loaded once and
  // attached to the Home category so the filter can match against it.
  private homeSearchText = '';
  routerSubscription!: Subscription;

  get isSearching(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  constructor(
    private http: HttpClient,
    public router: Router,
    private route: ActivatedRoute,
    private sidebarService: SidebarService
  ) {}

  ngOnInit() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['activeCategory']) {
          this.sidebarService.setActiveCategory(params['activeCategory']);
        }
      });

    // Subscribe once: cache active category and refresh expand state whenever it changes
    this.sidebarService.activeCategory$
      .pipe(takeUntil(this.destroy$))
      .subscribe((activeCategory) => {
        this.currentActiveCategory = activeCategory ?? '';
        this.updateActiveCategory();
      });

    this.http.get<FunctionItem[]>('assets/transformation/formulas/tags.json').subscribe((data) => {
      this.groupFunctionsByTags(data);
      this.updateActiveCategory();
    });

    // The Home page renders the "Elements of a Formula" overview. Index that
    // text so searching its words surfaces the Home entry in the sidebar.
    this.http
      .get<any>('assets/transformation/formulas/elements_of_formula.json')
      .subscribe((data) => {
        this.homeSearchText = this.buildHomeSearchText(data);
        this.attachHomeSearchText();
      });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateActiveCategory();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.applyFilter();
  }

  // Press "/" to focus the sidebar filter (matches the recipe sidebar). Ignored
  // while typing in a field or when combined with a modifier key.
  @HostListener('document:keydown./', ['$event'])
  onSlashKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const isEditable =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (isEditable) return;
    event.preventDefault();
    this.searchBox?.focus();
  }

  // Rebuild the flat search results for the current query. The category tree is
  // shown when the query is empty; while searching, searchResults is shown
  // instead so each function appears once rather than under every tag it has.
  private applyFilter(): void {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.searchResults = [];
      return;
    }

    // Special pages (Home, Operators, …) as single rows when their name or, for
    // Home, its indexed overview text matches.
    const specials: NavSearchResult[] = this.functionCategories
      .filter(
        (c) => SPECIAL_ROUTES[c.name] && this.categoryMatchesQuery(c, query)
      )
      .map((c) => ({ name: c.name, link: ['/transformation', SPECIAL_ROUTES[c.name]] }));

    // Functions matched by their own name or any of their tags. allFunctions is
    // already unique, so there are no cross-category repeats.
    const functions: NavSearchResult[] = this.allFunctions
      .filter(
        (fn) =>
          fn.name.toLowerCase().includes(query) ||
          fn.tags.some((tag) => tag.toLowerCase().includes(query))
      )
      .map((fn) => ({ name: fn.name, link: this.functionLink(fn) }));

    this.searchResults = [...specials, ...functions];
  }

  // A function's detail-page link, routed under its primary (first non-special)
  // category — any of its categories resolves to the same page.
  private functionLink(fn: SearchableFunction): string[] {
    const primaryTag = fn.tags.find((tag) => !SPECIAL_TAGS.has(tag)) ?? fn.tags[0];
    return ['/transformation', categorySlug(primaryTag), fn.route];
  }

  // A category matches on its own name/tag or, for Home, on its indexed
  // overview text. (query is already lowercased by applyFilter.)
  private categoryMatchesQuery(category: FunctionCategory, query: string): boolean {
    return (
      category.name.toLowerCase().includes(query) ||
      (category.searchText?.includes(query) ?? false)
    );
  }

  trackBySearchResult(_: number, result: NavSearchResult): string {
    return result.link.join('/');
  }

  trackByCategoryName(_: number, category: FunctionCategory): string {
    return category.name;
  }

  // Special categories (Home, Operators, Global Variables, Apex Class) navigate
  // directly instead of expanding a function list, so they have no children.
  categoryHasChildren(category: FunctionCategory): boolean {
    return !SPECIAL_ROUTES[category.name];
  }

  // True for the category holding the active page — drives the brand-colored
  // header highlight (setup's .in-path state).
  isCategoryActive(category: FunctionCategory): boolean {
    return category.name === this.activeCategoryName;
  }

  // Special categories track their expand state in dedicated flags rather than
  // on category.expanded; centralize the lookup so the template stays simple.
  isCategoryExpanded(category: FunctionCategory): boolean {
    switch (category.name) {
      case 'Operators':
        return this.operatorExpand;
      case 'Global Variables':
        return this.globalVariableExpand;
      case 'Apex Class':
        return this.apexClassExpand;
      default:
        return category.expanded;
    }
  }

  trackByFunctionRoute(_: number, fn: { route: string }): string {
    return fn.route;
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  groupFunctionsByTags(functionItems: FunctionItem[]) {
    // Flat, deduped function list (tags.json lists each function once with all
    // its tags) for the flat search results, minus the special pseudo entries.
    this.allFunctions = functionItems
      .filter((item) => !SPECIAL_ITEM_NAMES.has(item['Item Name']))
      .map((item) => ({
        name: item['Item Name'],
        route: buildRoute(item['Item Name']),
        tags: item.Tags,
      }))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aDollar = aName.startsWith('$');
        const bDollar = bName.startsWith('$');
        if (aDollar && !bDollar) return 1;
        if (!aDollar && bDollar) return -1;
        return aName.localeCompare(bName);
      });

    const tagMap: { [tag: string]: { name: string; route: string }[] } = {};

    functionItems.forEach((item) => {
      item.Tags.forEach((tag) => {
        if (!tagMap[tag]) {
          tagMap[tag] = [];
        }
        tagMap[tag].push({
          name: item['Item Name'],
          route: buildRoute(item['Item Name']),
        });
      });
    });

    this.functionCategories = Object.keys(tagMap).map((tag) => ({
      name: tag,
      expanded: false,
      functions: tagMap[tag].sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aDollar = aName.startsWith('$');
        const bDollar = bName.startsWith('$');
        if (aDollar && !bDollar) return 1;
        if (!aDollar && bDollar) return -1;
        return aName.localeCompare(bName);
      }),
    }));

    const TAG_ORDER = [
      'Text', 'Logical', 'Number', 'Date & Time', 'Operators',
      'Global Variables', 'Randomization', 'Type Processing', 'Trigger', 'Advanced',
    ];

    this.functionCategories.sort((a, b) => {
      const indexA = TAG_ORDER.indexOf(a.name);
      const indexB = TAG_ORDER.indexOf(b.name);
      return (
        (indexA === -1 ? Infinity : indexA) -
        (indexB === -1 ? Infinity : indexB)
      );
    });

    this.functionCategories.unshift({
      name: 'Home',
      expanded: false,
      functions: [],
    });

    // Attach the Home overview text (if already loaded) and point the view at
    // the freshly built list, re-applying any active query.
    this.attachHomeSearchText();
  }

  // Flatten the elements_of_formula.json into one lowercased searchable blob.
  private buildHomeSearchText(data: any): string {
    const parts = ['Formula', data?.title ?? '', data?.description ?? ''];
    (data?.elements ?? []).forEach((el: any) => {
      parts.push(el?.element ?? '', el?.description ?? '');
    });
    return parts.join(' ').toLowerCase();
  }

  // Copy the Home overview text onto the Home category and refresh the view.
  // Called from both the tags load (which rebuilds the Home entry) and the
  // elements load, since either may complete first.
  private attachHomeSearchText(): void {
    const home = this.functionCategories.find((c) => c.name === 'Home');
    if (home) {
      home.searchText = this.homeSearchText;
    }
    this.applyFilter();
  }

  toggleCategory(category: FunctionCategory): void {
    const target = SPECIAL_ROUTES[category.name];
    if (target) {
      this.sidebarService.setActiveCategory('');
      category.expanded = true;
      this.router.navigate(['/transformation', target]);
      this.linkClick.emit();
      return;
    }
    category.expanded = !category.expanded;
  }

  updateActiveCategory() {
    // URLs come in three shapes (under the /transformation mount):
    //   /transformation/home, /transformation/<funcSlug> (legacy/special),
    //   and the canonical /transformation/<categorySlug>/<funcSlug>.
    // Strip query/fragment, then skip the leading "transformation" segment.
    const path = this.router.url.split('?')[0].split('#')[0];
    const urlSegments = path.split('/');
    const first = urlSegments[2] ?? '';
    const second = urlSegments[3];
    // When two segments are present, the first is a category slug; otherwise
    // the lone segment is the doc slug (function name, home, or special page).
    const explicitCategory = second ? categoryNameFromSlug(first) : null;
    const activeRoute = second ?? first;

    const activeCategory = this.currentActiveCategory;
    let activeName = '';
    this.functionCategories.forEach((category) => {
      if (category.name === 'Home') {
        category.expanded = activeRoute === '' || activeRoute === 'home';
        if (category.expanded) activeName = category.name;
      } else if (category.name === 'Operators') {
        this.operatorExpand = activeRoute === 'operators';
        if (this.operatorExpand) activeName = category.name;
      } else if (category.name === 'Global Variables') {
        this.globalVariableExpand = activeRoute === 'global_variables' ||
          activeRoute === 'joiner' ||
          explicitCategory === 'Global Variables' ||
          activeCategory === 'Global Variables';
        if (this.globalVariableExpand) activeName = category.name;
      } else if (category.name === 'Apex Class') {
        this.apexClassExpand = activeRoute === 'apex_class' ||
          explicitCategory === 'Apex Class';
        if (this.apexClassExpand) activeName = category.name;
      } else {
        if (explicitCategory) {
          category.expanded = category.name === explicitCategory;
        } else if (activeCategory) {
          category.expanded = category.name === activeCategory;
        } else {
          category.expanded = category.functions.some(
            (fn) => fn.route === activeRoute
          );
        }
        if (category.expanded) activeName = category.name;
      }
    });
    this.activeCategoryName = activeName;
  }
}
