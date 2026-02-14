import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, shareReplay } from 'rxjs/operators';
import { Page, SetupIndexItem } from '../models/setup.model';

@Injectable({
  providedIn: 'root'
})
export class SetupService {
  private readonly SETUPS_PATH = 'assets/setups';
  private setupsCache$ = new BehaviorSubject<Page[]>([]);
  private indexCache: SetupIndexItem[] | null = null;

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
  }
}
