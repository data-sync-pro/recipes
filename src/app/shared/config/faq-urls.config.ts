/**
 * FAQ URL Configuration
 *
 * Holds the valid category/subcategory lists used by the FAQ route matchers
 * (faq-routing.module.ts) and shared with the component's category mapping.
 *
 * Reference-key → URL resolution lives in FaqUrlService — the static
 * mappings that used to live here were moved into that service so they can
 * be combined with runtime FAQ metadata.
 */

export const VALID_CATEGORIES = [
  'general',
  'processes',
  'process-steps',
  'query-manager',
  'rules-engines',
  'transformation',
  'executables',
  'connections',
] as const;

export const VALID_SUBCATEGORIES = [
  'action-button',
  'action',
  'batch',
  'data-list',
  'data-loader',
  'input',
  'mapping',
  'match',
  'preview',
  'retrieve',
  'scoping',
  'trigger',
  'verify',
] as const;
