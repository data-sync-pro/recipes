import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd, Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  showHeaderFooter = true;
  showScrollToTop = false;
  readonly currentYear = new Date().getFullYear();

  private readonly destroy$ = new Subject<void>();

  constructor(private router: Router) {}

  ngOnInit() {
    this.router.events
      .pipe(
        filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        // Hide header and footer on editor pages
        this.showHeaderFooter = !event.url.includes('/faq-editor')
          && !event.url.includes('/recipe-editor')
          && !event.url.startsWith('/transformation/editor');

        // Show the global (window-scroll) scroll-to-top button on pages that
        // scroll the page itself. Transformation docs now scroll the window
        // (like recipes), so they use this shared button too — the editor keeps
        // its own internal-scroll layout and is excluded.
        this.showScrollToTop = event.url.startsWith('/recipes')
          || (event.url.startsWith('/transformation')
            && !event.url.startsWith('/transformation/editor'));
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
