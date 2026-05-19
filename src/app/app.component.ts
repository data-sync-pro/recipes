import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, Event as RouterEvent } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  showHeaderFooter = true;
  showScrollToTop = false;

  constructor(private router: Router) {}

  ngOnInit() {
    this.router.events
      .pipe(filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        // Hide header and footer on editor pages
        this.showHeaderFooter = !event.url.includes('/faq-editor')
          && !event.url.includes('/recipe-editor')
          && !event.url.startsWith('/transformation/editor');

        // Show scroll-to-top button only on recipe pages
        // (transformation pages have their own internal scroll-to-top tied to the content scroll container)
        this.showScrollToTop = event.url.startsWith('/recipes');
      });
  }
}
