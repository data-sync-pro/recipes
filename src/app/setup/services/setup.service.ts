import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, shareReplay } from 'rxjs/operators';
import { Page, SetupIndexItem, NavNode } from '../models/setup.model';

@Injectable({
  providedIn: 'root'
})
export class SetupService {
  private readonly SETUPS_PATH = 'assets/setups';
  private setupsCache$ = new BehaviorSubject<Page[]>([]);
  private indexCache: SetupIndexItem[] | null = null;
  private navTreeCache: NavNode[] | null = null;

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
          slugs.push(node.slug);
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
