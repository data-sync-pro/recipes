import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';

const SITE_NAME = 'Data Sync Pro';
// Canonical production origin. Used to build absolute og:url / canonical URLs
// during prerendering, where `window` is unavailable.
const PROD_ORIGIN = 'https://www.datasyncpro.io';
const MAX_DESCRIPTION = 160;

/**
 * Centralizes per-route SEO tags (title, meta description, Open Graph, canonical)
 * so every prerendered content page ships correct, page-specific metadata.
 * Works during SSG: og:url/canonical fall back to PROD_ORIGIN + the route path
 * when there is no `window`, and the injected DOCUMENT handles the canonical link.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly isBrowser: boolean;

  constructor(
    private title: Title,
    private meta: Meta,
    private router: Router,
    @Inject(DOCUMENT) private doc: Document,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /**
   * Set the document title, meta description and Open Graph/canonical tags for
   * the current route. `title` is the page-specific part; the site name is
   * appended automatically. `description` may contain HTML — it is stripped and
   * truncated. Pass `path` to force a canonical path (defaults to router.url).
   */
  setPage(opts: { title: string; description?: string; path?: string }): void {
    const fullTitle = opts.title ? `${opts.title} - ${SITE_NAME}` : SITE_NAME;
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:type', content: 'article' });

    const description = this.toDescription(opts.description);
    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:description', content: description });
    }

    const url = this.absoluteUrl(opts.path);
    this.meta.updateTag({ property: 'og:url', content: url });
    this.setCanonical(url);
  }

  /**
   * Inject (or replace) a schema.org ItemList JSON-LD script listing the pages
   * of the current section with ABSOLUTE urls. Besides being valid structured
   * data, this puts full URLs into the prerendered HTML so AI fetchers whose
   * tools only follow absolute URLs seen in a page can reach every detail page.
   */
  setItemList(name: string, items: Array<{ name: string; path: string }>): void {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name,
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        url: `${PROD_ORIGIN}${it.path}`,
      })),
    };
    let script = this.doc.querySelector('script[data-seo="item-list"]') as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-seo', 'item-list');
      this.doc.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }

  private absoluteUrl(path?: string): string {
    if (this.isBrowser && !path) return this.doc.location.href;
    const p = (path ?? this.router.url).split('#')[0].split('?')[0];
    return `${PROD_ORIGIN}${p}`;
  }

  private setCanonical(href: string): void {
    let link = this.doc.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private toDescription(html?: string): string {
    if (!html) return '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_DESCRIPTION) return text;
    return text.slice(0, MAX_DESCRIPTION - 1).replace(/\s+\S*$/, '') + '…';
  }
}
