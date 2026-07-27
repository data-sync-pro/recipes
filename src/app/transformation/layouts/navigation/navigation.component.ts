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

// One searchable thing in the docs, as emitted by scripts/gen-formulas-index.mjs:
// every function, global variable, operator and standalone page, each with its
// prose pre-flattened into `keywords` (already lowercased).
//
// `page: true` means the entry lives at /transformation/<route>; everything else
// is a function under /transformation/<cat>/<route>. Link assembly stays here so
// route.util.ts remains the only owner of slugs.
//
// `pageName` is set when the entry is only a row on a shared page (every global
// variable, every operator): it is indexed on its own so name and prose are
// searchable, but the result offered is the page, listed under this title.
interface SearchIndexEntry {
  name: string;
  route: string;
  tags: string[];
  keywords: string;
  page?: boolean;
  pageName?: string;
}

// An index entry with its match forms precomputed once at load, so a keystroke
// costs only substring tests.
interface IndexedEntry extends SearchIndexEntry {
  rawName: string;
  looseName: string;
  looseTags: string;
  looseKeywords: string;
}

// The query in both forms, computed once per keystroke.
interface Query {
  raw: string;
  loose: string;
}

// A single row in the flat search results list.
interface NavSearchResult {
  name: string;
  link: string[];
}

interface FunctionCategory {
  name: string;
  expanded: boolean;
  functions: { name: string; route: string }[];
}

const SPECIAL_ROUTES: Record<string, string> = {
  Operators: 'operators',
  'Global Variables': 'global_variables',
  'Apex Class': 'apex_class',
};

// Tags that map to special pages rather than a function category; skipped when
// choosing a function's primary category for its detail-page link.
const SPECIAL_TAGS = new Set(['Operators', 'Global Variables', 'Apex Class']);

// Users type separators loosely — "org domain" for $ORG_DOMAIN_URL, "date time"
// for the "Date & Time" tag — so both sides are matched with every run of
// non-alphanumerics collapsed to a single space. A query made up entirely of
// symbols ("+", "&&") collapses to nothing and falls back to a raw substring
// match, which is what keeps the operators findable.
const loose = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// True when `needle` starts a word in `haystack`. Both sides have been through
// loose(), so words are separated by exactly one space and this is a plain
// substring test. Matching at word starts keeps prefix typing working ("valu"
// still finds "value", "hours" still finds BUSINESS_HOURS_ADD) while dropping
// the mid-word coincidences that made short function names match everything:
// SIN hit "bu(sin)ess" and "u(sin)g", TAN "s(tan)dard", DAY "to(day)()".
const startsWord = (haystack: string, needle: string): boolean =>
  haystack.startsWith(needle) || haystack.includes(` ${needle}`);

// $-prefixed entries sort after plain names so the alphabet isn't interrupted by
// a block of variables.
const compareNames = (a: string, b: string): number => {
  const aName = a.toLowerCase();
  const bName = b.toLowerCase();
  const aDollar = aName.startsWith('$');
  const bDollar = bName.startsWith('$');
  if (aDollar !== bDollar) return aDollar ? 1 : -1;
  return aName.localeCompare(bName);
};

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
  // Build-time search index (see scripts/gen-formulas-index.mjs) — the single
  // source for the flat search results.
  private searchIndex: IndexedEntry[] = [];
  // Gates the "No matches found" row: typing before the index arrives would
  // otherwise claim there are no matches when nothing has been searched yet.
  // Set on failure too, so a load error degrades to the normal empty state
  // rather than a permanently blank list.
  searchIndexLoaded = false;
  searchQuery = '';
  // Flat search results shown in place of the category tree while a query is
  // active — one row per destination page; see applyFilter().
  searchResults: NavSearchResult[] = [];
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

    this.http
      .get<SearchIndexEntry[]>('assets/transformation/formulas/_search-index.json')
      .subscribe({
        next: (index) => {
          this.searchIndex = index.map((entry) => ({
            ...entry,
            rawName: entry.name.toLowerCase(),
            looseName: loose(entry.name),
            looseTags: entry.tags.map(loose).join(' '),
            looseKeywords: loose(entry.keywords),
          }));
          this.searchIndexLoaded = true;
          this.applyFilter();
        },
        error: () => {
          this.searchIndexLoaded = true;
        },
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
  // instead.
  //
  // Results are one row per destination page, not per index entry: a function
  // carrying several tags resolves to one page, and so do the dozens of global
  // variables and operators that are documented as rows of a single table.
  // Typing "$" used to list every variable separately even though all of them
  // led to the same place; now that run collapses into one "Global Variables"
  // row, ranked by its best-matching member.
  private applyFilter(): void {
    const raw = this.searchQuery.trim().toLowerCase();
    if (!raw) {
      this.searchResults = [];
      return;
    }
    const query: Query = { raw, loose: loose(raw) };

    const byPage = new Map<string, { name: string; link: string[]; rank: number }>();
    for (const entry of this.searchIndex) {
      const rank = this.rankEntry(entry, query);
      if (rank < 0) continue;
      const link = this.entryLink(entry);
      const key = link.join('/');
      const seen = byPage.get(key);
      if (seen && seen.rank <= rank) continue;
      byPage.set(key, { name: entry.pageName ?? entry.name, link, rank });
    }

    this.searchResults = Array.from(byPage.values())
      .sort((a, b) => a.rank - b.rank || compareNames(a.name, b.name))
      .map(({ name, link }) => ({ name, link }));
  }

  // Match strength, lowest first; -1 means no match. Name hits outrank tag hits,
  // which outrank prose hits, so typing "add" surfaces ADD_DAYS above the dozen
  // functions whose descriptions merely mention adding.
  private rankEntry(entry: IndexedEntry, query: Query): number {
    if (!query.loose) {
      // Symbol-only query ("+", "&&"): the loose forms have nothing left to
      // compare, so fall back to the name as authored. Prose is deliberately
      // not consulted here — every function's syntax carries parentheses, so
      // searching "()" would otherwise return most of the catalogue.
      return entry.rawName.includes(query.raw) ? 2 : -1;
    }
    if (entry.looseName === query.loose) return 0;
    if (entry.looseName.startsWith(query.loose)) return 1;
    if (startsWord(entry.looseName, query.loose)) return 2;
    if (startsWord(entry.looseTags, query.loose)) return 3;
    if (startsWord(entry.looseKeywords, query.loose)) return 4;
    return -1;
  }

  // Pages address themselves directly; functions are routed under their primary
  // (first non-special) category — any of their categories resolves to the same
  // page.
  private entryLink(entry: IndexedEntry): string[] {
    if (entry.page) {
      return ['/transformation', entry.route];
    }
    const primaryTag = entry.tags.find((tag) => !SPECIAL_TAGS.has(tag)) ?? entry.tags[0];
    if (!primaryTag) return ['/transformation', entry.route];
    return ['/transformation', categorySlug(primaryTag), entry.route];
  }

  // One row per destination page, so the link identifies the result.
  trackBySearchResult(_: number, result: NavSearchResult): string {
    return result.link.join('/');
  }

  trackByCategoryName(_: number, category: FunctionCategory): string {
    return category.name;
  }

  // Special categories (Home, Operators, Global Variables, Apex Class) navigate
  // directly instead of expanding a function list, so they have no children.
  categoryHasChildren(category: FunctionCategory): boolean {
    return !SPECIAL_ROUTES[category.name] && category.name !== 'Home';
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
      functions: tagMap[tag].sort((a, b) => compareNames(a.name, b.name)),
    }));

    const TAG_ORDER = [
      'Operators', 'Global Variables', 'Text', 'Logical', 'Number', 'Date & Time',
      'Randomization', 'Type Processing', 'Trigger', 'Advanced',
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
  }

  toggleCategory(category: FunctionCategory): void {
    if (category.name === 'Home') {
      this.sidebarService.setActiveCategory('');
      category.expanded = true;
      this.router.navigate(['/transformation']);
      return;
    }
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
