import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { LoggerService } from './logger.service';
import { CategoryOrderMap } from '../utils/data.utils';

/**
 * Loads the manual per-category recipe ordering from
 * assets/recipes/category-order.json and exposes it to the views that render
 * recipes grouped by category (the sidebar tree and the category landing page).
 *
 * The map is fetched once and cached. On any failure it resolves to an empty
 * map, so every category simply falls back to alphabetical ordering — the
 * feature degrades gracefully and never blocks recipe rendering.
 */
@Injectable({
  providedIn: 'root'
})
export class CategoryOrderService {
  private readonly CATEGORY_ORDER_URL = 'assets/recipes/category-order.json';

  private readonly orderMap$ = new ReplaySubject<CategoryOrderMap>(1);
  private latest: CategoryOrderMap = {};
  private loadKicked = false;

  constructor(
    private http: HttpClient,
    private logger: LoggerService
  ) {
    this.load();
  }

  /** Emits the current order map (and any future reloads). Always emits once loaded. */
  getOrderMap$(): Observable<CategoryOrderMap> {
    return this.orderMap$.asObservable();
  }

  /** Last loaded order map, or `{}` before the fetch resolves. */
  getOrderMapSync(): CategoryOrderMap {
    return this.latest;
  }

  private load(): void {
    if (this.loadKicked) {
      return;
    }
    this.loadKicked = true;

    this.http.get<CategoryOrderMap>(this.CATEGORY_ORDER_URL).pipe(
      tap(map => this.logger.debug('Category order loaded', { categories: Object.keys(map || {}).length })),
      catchError(error => {
        this.logger.warn('Failed to load category order; falling back to alphabetical', error);
        return of<CategoryOrderMap>({});
      })
    ).subscribe(map => {
      this.latest = map || {};
      this.orderMap$.next(this.latest);
    });
  }
}
