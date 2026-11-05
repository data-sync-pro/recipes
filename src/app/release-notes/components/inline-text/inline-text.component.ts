import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { InlineSpan, RichText } from '../../models/release.model';

interface InlineView {
  text: string;
  bold: boolean;
  /** Site-relative link: navigated by the router, no page reload. */
  routerLink: UrlTree | null;
  /** Any other link: opens in a new tab. */
  externalHref: string | null;
}

/**
 * Renders RichText (plain text with optional bold runs and links) as real
 * template elements. Shared by every block that shows text.
 */
@Component({
  selector: 'app-release-inline-text',
  templateUrl: './inline-text.component.html',
  styleUrls: ['./inline-text.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineTextComponent {
  spans: InlineView[] = [];

  constructor(private router: Router) {}

  @Input() set text(value: RichText) {
    const parts = typeof value === 'string' ? [value] : value;
    this.spans = parts.map(part => this.toView(typeof part === 'string' ? { text: part } : part));
  }

  private toView({ text, bold, href }: InlineSpan): InlineView {
    // A single leading slash is a path on this site; '//host' is not.
    const isInternal = !!href && href.startsWith('/') && !href.startsWith('//');
    return {
      text,
      bold: !!bold,
      // Parsed so that '?query' and '#fragment' in the path keep working.
      routerLink: isInternal ? this.router.parseUrl(href) : null,
      externalHref: href && !isInternal ? href : null,
    };
  }
}
