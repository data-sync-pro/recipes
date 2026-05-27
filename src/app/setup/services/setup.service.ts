import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { map, catchError, tap, shareReplay, switchMap } from 'rxjs/operators';
import { Block, Page, SetupIndexItem, NavNode } from '../models/setup.model';

@Injectable({
  providedIn: 'root'
})
export class SetupService {
  private readonly SETUPS_PATH = 'assets/setups';
  private setupsCache$ = new BehaviorSubject<Page[]>([]);
  private indexCache: SetupIndexItem[] | null = null;
  private navTreeCache: NavNode[] | null = null;
  private contentIndexCache: Map<string, string> | null = null;
  private contentIndex$: Observable<Map<string, string>> | null = null;

  constructor(private http: HttpClient) {}

  getSetupIndex(): Observable<SetupIndexItem[]> {
    if (this.indexCache) {
      return of(this.indexCache);
    }

    return this.http.get<SetupIndexItem[]>(`${this.SETUPS_PATH}/index.json`).pipe(
      tap(index => this.indexCache = index),
      catchError(error => {
        console.error('Failed to load setup index:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getSetups(): Observable<Page[]> {
    return this.setupsCache$.asObservable();
  }

  loadAllSetups(): Observable<Page[]> {
    return this.getSetupIndex().pipe(
      map(index => index.filter(item => item.active)),
      tap(activeItems => {
        activeItems.forEach(item => this.loadSetup(item.slug));
      }),
      map(() => this.setupsCache$.value)
    );
  }

  loadSetup(slug: string): Observable<Page | null> {
    const cached = this.setupsCache$.value.find(s => s.slug === slug);
    if (cached) {
      return of(cached);
    }

    return this.http.get<Page>(`${this.SETUPS_PATH}/${slug}.json`).pipe(
      tap(setup => {
        if (setup) {
          setup.slug = slug;
          const current = this.setupsCache$.value;
          if (!current.find(s => s.slug === slug)) {
            this.setupsCache$.next([...current, setup]);
          }
        }
      }),
      catchError(error => {
        console.error(`Failed to load setup ${slug}:`, error);
        return of(null);
      })
    );
  }

  getSetupBySlug(slug: string): Observable<Page | null> {
    const cached = this.setupsCache$.value.find(s => s.slug === slug);
    if (cached) {
      return of(cached);
    }
    return this.loadSetup(slug);
  }

  clearCache(): void {
    this.setupsCache$.next([]);
    this.indexCache = null;
    this.navTreeCache = null;
    this.contentIndexCache = null;
    this.contentIndex$ = null;
  }

  /**
   * Build a slug -> lowercased searchable-text map across every page.
   * Loads each page JSON once and caches the result for the session.
   */
  getContentIndex(): Observable<Map<string, string>> {
    if (this.contentIndexCache) return of(this.contentIndexCache);
    if (this.contentIndex$) return this.contentIndex$;

    this.contentIndex$ = this.getNavTree().pipe(
      switchMap(tree => {
        const slugs = this.flattenSlugs(tree);
        if (!slugs.length) return of([] as Array<{ slug: string; text: string }>);
        return forkJoin(
          slugs.map(slug =>
            this.loadSetup(slug).pipe(
              map(page => ({ slug, text: page ? this.extractPageText(page) : '' })),
              catchError(() => of({ slug, text: '' }))
            )
          )
        );
      }),
      map(results => {
        const index = new Map<string, string>();
        for (const { slug, text } of results) {
          index.set(slug, text.toLowerCase());
        }
        this.contentIndexCache = index;
        return index;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.contentIndex$;
  }

  private extractPageText(page: Page): string {
    const parts: string[] = [];
    if (page.title) parts.push(page.title);

    const walk = (blocks: Block[] | undefined): void => {
      if (!blocks) return;
      for (const block of blocks) {
        if (block.content) parts.push(block.content);
        if (block.title) parts.push(block.title);
        if (block.alt) parts.push(block.alt);
        if (block.caption) parts.push(...block.caption);
        if (block.steps) parts.push(...block.steps);
        if (block.fields) {
          for (const f of block.fields) {
            if (f.name) parts.push(f.name);
            if (f.description) parts.push(f.description);
          }
        }
        if (block.groups) {
          for (const g of block.groups) {
            if (g.title) parts.push(g.title);
            for (const f of g.fields) {
              if (f.name) parts.push(f.name);
              if (f.description) parts.push(f.description);
            }
          }
        }
        if (block.columns && block.rows) {
          for (const row of block.rows) {
            for (const col of block.columns) {
              const v = row[col.key];
              if (v) parts.push(v);
            }
          }
        }
        if (block.items) {
          for (const item of block.items) {
            if (item.label) parts.push(item.label);
            walk(item.children);
          }
        }
        walk(block.children);
      }
    };

    walk(page.blocks);
    return parts.join(' ');
  }

  // ==================== New Navigation Tree Methods ====================

  /**
   * Get the navigation tree structure
   */
  getNavTree(): Observable<NavNode[]> {
    if (this.navTreeCache) {
      return of(this.navTreeCache);
    }

    return this.http.get<NavNode[]>(`${this.SETUPS_PATH}/index.json`).pipe(
      map(tree => this.filterVisibleNodes(tree)),
      tap(tree => this.navTreeCache = tree),
      catchError(error => {
        console.error('Failed to load navigation tree:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Filter out nodes with visible: false
   */
  private filterVisibleNodes(nodes: NavNode[]): NavNode[] {
    return nodes
      .filter(node => node.visible !== false)
      .map(node => ({
        ...node,
        children: node.children ? this.filterVisibleNodes(node.children) : undefined
      }));
  }

  /**
   * Synchronous accessor for the already-loaded nav tree. Returns [] until
   * getNavTree() has resolved at least once (SetupComponent loads it on init).
   */
  getCachedNavTree(): NavNode[] {
    return this.navTreeCache ?? [];
  }

  /**
   * Find a node by slug in the tree
   */
  findNodeBySlug(nodes: NavNode[], slug: string): NavNode | null {
    for (const node of nodes) {
      if (node.slug === slug) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeBySlug(node.children, slug);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get the path (ancestors) to a node by slug
   */
  getPathToNode(nodes: NavNode[], slug: string, path: NavNode[] = []): NavNode[] | null {
    for (const node of nodes) {
      if (node.slug === slug) {
        return [...path, node];
      }
      if (node.children) {
        const found = this.getPathToNode(node.children, slug, [...path, node]);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Flatten the tree to get all slugs
   */
  flattenSlugs(nodes: NavNode[]): string[] {
    const slugs: string[] = [];
    const traverse = (nodeList: NavNode[]) => {
      for (const node of nodeList) {
        if (node.visible !== false) {
          if (node.slug) {
            slugs.push(node.slug);
          }
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    };
    traverse(nodes);
    return slugs;
  }
}
