import { Injectable, Injector } from '@angular/core';
import { FAQItem } from '../models/faq.model';
import { FAQService } from './faq.service';

// Static mappings for category-level navigation. URLs are absolute and
// prefixed with /faq to match the FAQ module's mount point.
const CATEGORY_URL_MAPPINGS: { readonly [key: string]: string } = {
  'batch': '/faq/rules-engines/batch',
  'trigger': '/faq/rules-engines/trigger',
  'data-list': '/faq/rules-engines/data-list',
  'action-button': '/faq/rules-engines/action-button',
  'data-loader': '/faq/rules-engines/data-loader',
  'processes.input': '/faq/processes/input',
  'processes.preview': '/faq/processes/preview',
  'processes.retrieve': '/faq/processes/retrieve',
  'processes.scoping': '/faq/processes/scoping',
  'processes.match': '/faq/processes/match',
  'processes.mapping': '/faq/processes/mapping',
  'processes.action': '/faq/processes/action',
  'processes.verify': '/faq/processes/verify',
  'query-manager': '/faq/query-manager',
};

// Slug-only keys from the old per-bucket entries. We resolve these at runtime
// to /<cat>/<sub?>/<slug> via the FAQ item's category/subCategory.
const KEY_TO_FOLDER_ID: { readonly [key: string]: string } = {
  'batch.what-is-batch': 'what-is-batch-job',
  'data-list.what-is-data-list': 'what-is-data-list',
  'triggers.how-it-works': 'how-does-trigger-work',
  'trigger.what-is-self-adaptive-trigger': 'what-is-a-self-adaptive-trigger',
  'action-button.what-is-action-button': 'what-is-action-button',
  'data-loader.how-it-works': 'what-is-data-loader',
  'input.what-does-input-do': 'what-does-input-do',
  'preview.what-does-preview-do': 'what-does-preview-do',
  'retrieve.what-does-retrieve-do': 'what-does-retrieve-do',
  'scoping.what-does-scoping-do': 'what-does-scoping-do',
  'match.what-does-match-do': 'what-does-match-do',
  'mapping.what-does-mapping-do': 'what-does-mapping-do',
  'action.what-does-action-do': 'what-does-action-do',
  'verify.what-does-verify-do': 'what-does-verify-do',
  'query-manager.what-is-query-manager': 'what-is-query-manager',
};

@Injectable({ providedIn: 'root' })
export class FaqUrlService {
  // FAQService is resolved lazily because there is a constructor-time cycle
  // (FAQService → AutoLinkService → FaqUrlService → FAQService).
  constructor(private injector: Injector) {}

  private _faqService?: FAQService;
  private get faqService(): FAQService {
    if (!this._faqService) {
      this._faqService = this.injector.get(FAQService);
    }
    return this._faqService;
  }

  /**
   * Resolve a `data-faq-link` reference key to a full FAQ URL.
   * Returns '' when the key is unknown or the target FAQ isn't loaded.
   */
  getFAQUrlByKey(key: string): string {
    const staticPath = CATEGORY_URL_MAPPINGS[key];
    if (staticPath) return staticPath;

    const folderId = KEY_TO_FOLDER_ID[key];
    if (!folderId) return '';

    const item = this.faqService.getFAQByFolderId(folderId);
    if (!item) {
      console.warn(`FaqUrlService: no FAQ found for folderId "${folderId}" (key="${key}")`);
      return '';
    }

    return this.buildAnswerUrl(item);
  }

  // Mirrors the encoding used by FaqComponent.encode + buildAnswerUrlSegments.
  // Categories and subcategories from faqs.json are lowercased and hyphenated.
  private buildAnswerUrl(item: FAQItem): string {
    const parts = ['', 'faq', this.slug(item.category)];
    if (item.subCategory) parts.push(this.slug(item.subCategory));
    parts.push(item.folderId);
    return parts.join('/');
  }

  private slug(name: string): string {
    return encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, '-'));
  }
}
