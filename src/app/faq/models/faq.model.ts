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
  viewCount?: number;
  isPopular?: boolean;
  isLoading?: boolean;
  tags?: string[];
  lastUpdated?: Date;
  showSocialShare?: boolean;
  isActive?: boolean;
}

export interface FAQCategory {
  name: string;
  count: number;
  subCategories: FAQSubCategory[];
}

export interface FAQSubCategory {
  name: string;
  count: number;
  parentCategory: string;
}

export interface SearchOptions {
  category?: string;
  subCategory?: string;
  includeAnswers?: boolean;
  maxResults?: number;
  fuzzySearch?: boolean;
}

export interface FAQStats {
  totalFAQs: number;
  totalCategories: number;
  totalSubCategories: number;
  mostViewedFAQs: FAQItem[];
  recentlyUpdated: FAQItem[];
}

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

export interface FAQSortOptions {
  field: 'question' | 'category' | 'viewCount' | 'lastUpdated';
  direction: 'asc' | 'desc';
}
