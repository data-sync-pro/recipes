import { ChangeDetectionStrategy, Component, HostListener, Input } from '@angular/core';

// Naming Conventions shows the rule under its top bar once the page has
// scrolled this far (homepage/app.js).
const SCROLLED_AFTER_PX = 8;

/**
 * The section's own top bar: brand mark plus the page name. Release Notes is
 * a standalone page (like Naming Conventions) and does not show the app header.
 */
@Component({
  selector: 'app-release-top-bar',
  templateUrl: './release-top-bar.component.html',
  styleUrls: ['./release-top-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseTopBarComponent {
  /** Page name shown after the brand mark. */
  @Input() label = '';

  scrolled = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scrolled = window.scrollY > SCROLLED_AFTER_PX;
  }
}
