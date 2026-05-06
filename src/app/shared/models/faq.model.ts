import { SafeHtml } from '@angular/platform-browser';

// One entry in assets/faqs/faqs.json — full metadata, including which folder
// (under assets/faqs/) holds the answer.html + images/ for this FAQ.
export interface FAQMetadata {
  id: string;
  folderId: string;
  question: string;
  category: string;
  subCategory?: string | null;
  seqNo?: string | null;
  isActive?: boolean;
}

/**
 * @deprecated Legacy schema of assets/data/faqs.json. Kept for import/migration
 * compatibility only. New code should use FAQMetadata + FAQIndexItem.
 */
export interface SourceFAQRecord {
  Id: string;
  Name?: string;
  Question__c: string;
  Answer__c: string | null;
  Category__c: string;
  SubCategory__c: string | null;
  SeqNo__c?: string | null;
  isActive?: boolean;
}

export interface FAQItem {
  id: string;
  seqNo?: string | null;
  question: string;
  answer: string;
  // Folder name under assets/faqs/. Identifies the FAQ on disk and in URLs.
  folderId: string;
  safeAnswer?: SafeHtml;
  category: string;
  subCategory?: string | null;
  isExpanded?: boolean;
  userRating?: boolean | null;
  viewCount?: number;
  isPopular?: boolean;
  isLoading?: boolean;
  tags?: string[];
  lastUpdated?: Date;
  showSocialShare?: boolean;
  isActive?: boolean;
}

/**

 */
export interface FAQSearchResult extends FAQItem {
  relevanceScore?: number;
  highlightedQuestion?: string;
  highlightedAnswer?: string;
  matchedFields?: string[];
}

/**

 */
export interface FAQCategory {
  name: string;
  count: number;
  subCategories: FAQSubCategory[];
}

/**

 */
export interface FAQSubCategory {
  name: string;
  count: number;
  parentCategory: string;
}

/**

 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

/**

 */
export interface SearchOptions {
  category?: string;
  subCategory?: string;
  includeAnswers?: boolean;
  maxResults?: number;
  fuzzySearch?: boolean;
}

/**

 */
export interface FAQStats {
  totalFAQs: number;
  totalCategories: number;
  totalSubCategories: number;
  mostViewedFAQs: FAQItem[];
  recentlyUpdated: FAQItem[];
}

/**

 */
export interface UserPreferences {
  preferredPageSize: number;
  preferredRenderMode: 'basic' | 'paginated' | 'virtual';
  searchHistory: string[];
  recentlyViewed: string[];
}

/**

 */
export interface FAQEvent {
  type: 'view' | 'rate' | 'search';
  faqId?: string;
  faqQuestion?: string;
  faqCategory?: string;
  searchQuery?: string;
  rating?: boolean;
  timestamp: Date;
  userId?: string;
}

/**

 */
export type RenderStrategy = 'basic' | 'paginated' | 'virtual';

/**

 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**

 */
export type ConnectionSpeed = 'slow' | 'fast';

/**

 */
export enum FAQContentStatus {
  NOT_LOADED = 'not_loaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

/**

 */
export interface SearchSuggestion {
  text: string;
  type: 'question' | 'category' | 'tag';
  count?: number;
  category?: string;
}

/**

 */
export interface FAQFilter {
  categories: string[];
  subCategories: string[];
  searchQuery: string;
  showPopularOnly: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**

 */
export interface FAQSortOptions {
  field: 'question' | 'category' | 'viewCount' | 'lastUpdated';
  direction: 'asc' | 'desc';
}

/**

 */
export interface FAQExportOptions {
  format: 'json' | 'csv' | 'pdf';
  includeCategories: string[];
  includeAnswers: boolean;
  includeMetadata: boolean;
}
