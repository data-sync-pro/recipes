import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { map, catchError, shareReplay, tap, finalize } from 'rxjs/operators';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PerformanceService } from './performance.service';
import { AutoLinkService } from './auto-link.service';
import { getFAQUrlByKey } from '../config/faq-urls.config';

import {
  SourceFAQRecord,
  FAQItem,
  FAQCategory,
  FAQSubCategory,
  SearchOptions,
  FAQStats,
  FAQFilter,
  FAQSortOptions
} from '../models/faq.model';

@Injectable({
  providedIn: 'root'
})
export class FAQService implements OnDestroy {
  private readonly FAQ_DATA_URL = 'assets/data/faqs.json';
  private readonly FAQ_CONTENT_BASE = 'assets/faq-item/';
  private readonly VERSION_URL = 'assets/data/version.json';
  
  // Cache
  private faqsCache$ = new BehaviorSubject<FAQItem[]>([]);
  private contentCache = new Map<string, SafeHtml>();
  private categoriesCache: FAQCategory[] = [];
  
  // Local Storage Cache Keys
  private readonly STORAGE_KEY_FAQ_CONTENT = 'faq_content_cache';
  private readonly STORAGE_KEY_FAQ_METADATA = 'faq_metadata_cache';
  private readonly STORAGE_KEY_POPULAR_FAQS = 'popular_faqs_cache';
  private readonly STORAGE_KEY_APP_VERSION = 'app_version_cache';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly VERSION_CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

  // Loading state
  private isLoading = false;
  private isInitialized = false;

  // Preloading
  private preloadingQueue = new Set<string>();
  private intersectionObserver?: IntersectionObserver;
  private readonly PRELOAD_THRESHOLD = 0.1; // Start preloading when item is 10% visible

  // Auto cache cleanup
  private cacheCleanupInterval?: number;
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // Check every hour

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private performanceService: PerformanceService,
    private autoLinkService: AutoLinkService
  ) {
    this.initializeService();
    this.initializeIntersectionObserver();
    this.loadFromLocalStorage();
    this.initializeAutoCleanup();
  }

  /**
   * Initialize service
   */
  private initializeService(): void {
    if (!this.isInitialized) {
      this.checkAndUpdateVersion().then(() => {
        this.loadFAQs();
      });
      this.isInitialized = true;
    }
  }

  /**
   * Initialize automatic cache cleanup
   */
  private initializeAutoCleanup(): void {
    // Run initial cleanup
    this.cleanExpiredCache();
    
    // Set up periodic cleanup every hour
    if (typeof window !== 'undefined') {
      this.cacheCleanupInterval = window.setInterval(() => {
        this.cleanExpiredCache();
        this.cleanExpiredMemoryCache();
      }, this.CLEANUP_INTERVAL);
    }
  }

  /**
   * Clean expired entries from memory cache
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Check each entry in memory cache
    this.contentCache.forEach((value, key) => {
      // Check if corresponding localStorage entry is expired
      try {
        const cachedContent = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
        if (cachedContent) {
          const parsedCache = JSON.parse(cachedContent);
          const cacheEntry = parsedCache[key];
          
          if (!cacheEntry || !this.isCacheValid(cacheEntry.timestamp)) {
            // Remove from memory cache if localStorage entry is expired or missing
            this.contentCache.delete(key);
            cleanedCount++;
          }
        }
      } catch (error) {
        // If there's an error, remove from memory cache to be safe
        this.contentCache.delete(key);
        cleanedCount++;
      }
    });

  }

  /**
   * Clean up resources on service destroy
   */
  ngOnDestroy(): void {
    // Clear the cleanup interval
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    
    // Clean up intersection observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }


  /**
   * Load cached content from local storage
   */
  private loadFromLocalStorage(): void {
    try {
      const cachedContent = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
      if (cachedContent) {
        const parsedCache = JSON.parse(cachedContent);
        Object.entries(parsedCache).forEach(([key, value]: [string, any]) => {
          if (this.isCacheValid(value.timestamp)) {
            // Store raw content - processing will happen in getFAQContent when needed
            this.contentCache.set(key, this.sanitizer.bypassSecurityTrustHtml(value.content));
          }
        });
      }
    } catch (error) {
      console.warn('Failed to load FAQ content from local storage:', error);
    }
  }

  /**
   * Save content to local storage
   */
  private saveToLocalStorage(answerPath: string, content: string): void {
    try {
      const existingCache = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
      const cache = existingCache ? JSON.parse(existingCache) : {};
      
      cache[answerPath] = {
        content,
        timestamp: Date.now()
      };

      localStorage.setItem(this.STORAGE_KEY_FAQ_CONTENT, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save FAQ content to local storage:', error);
    }
  }

  /**
   * Check if cached item is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL;
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    try {
      const cachedContent = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
      if (cachedContent) {
        const cache = JSON.parse(cachedContent);
        const cleanedCache: any = {};
        let originalCount = 0;
        let cleanedCount = 0;
        
        Object.entries(cache).forEach(([key, value]: [string, any]) => {
          originalCount++;
          if (this.isCacheValid(value.timestamp)) {
            cleanedCache[key] = value;
          } else {
            cleanedCount++;
          }
        });
        
        if (cleanedCount > 0) {
       localStorage.setItem(this.STORAGE_KEY_FAQ_CONTENT, JSON.stringify(cleanedCache));
        }
      }
    } catch (error) {
      console.warn('Failed to clean expired cache:', error);
    }
  }

  /**
   * Warm cache for popular FAQs
   */
  warmCacheForPopularFAQs(popularFaqIds: string[]): void {
    this.getFAQs().pipe(
      map(faqs => faqs.filter(faq => popularFaqIds.includes(faq.id))),
      tap(popularFaqs => {
        popularFaqs.forEach(faq => {
          if (faq.answerPath && !this.contentCache.has(faq.answerPath)) {
            this.preloadContent(faq.answerPath);
          }
        });
      })
    ).subscribe();
  }

  /**
   * Initialize intersection observer for content preloading
   */
  private initializeIntersectionObserver(): void {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const faqId = entry.target.getAttribute('data-faq-id');
              const answerPath = entry.target.getAttribute('data-answer-path');
              
              if (faqId && answerPath && !this.contentCache.has(answerPath)) {
                this.preloadContent(answerPath);
              }
            }
          });
        },
        {
          threshold: this.PRELOAD_THRESHOLD,
          rootMargin: '100px 0px' // Start preloading 100px before element enters viewport
        }
      );
    }
  }

  /**
   * Observe FAQ element for preloading
   */
  observeForPreloading(element: Element, faqId: string, answerPath: string): void {
    if (this.intersectionObserver && answerPath && !this.contentCache.has(answerPath)) {
      element.setAttribute('data-faq-id', faqId);
      element.setAttribute('data-answer-path', answerPath);
      this.intersectionObserver.observe(element);
    }
  }

  /**
   * Stop observing element
   */
  unobserveElement(element: Element): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(element);
    }
  }

  /**
   * Preload FAQ content in background
   */
  private preloadContent(answerPath: string): void {
    if (this.preloadingQueue.has(answerPath) || this.contentCache.has(answerPath)) {
      return;
    }

    this.preloadingQueue.add(answerPath);
    
    const fullPath = `${this.FAQ_CONTENT_BASE}${answerPath}`;
    this.http.get(fullPath, { responseType: 'text' }).pipe(
      map(content => {
        const processedContent = this.processContent(content);
        const safeContent = this.sanitizer.bypassSecurityTrustHtml(processedContent);
        
        // Save to local storage for future use
        this.saveToLocalStorage(answerPath, processedContent);
        
        return safeContent;
      }),
      catchError(error => {
        console.warn(`Failed to preload FAQ content: ${fullPath}`, error);
        return of(null);
      })
    ).subscribe(safeContent => {
      this.preloadingQueue.delete(answerPath);
      if (safeContent) {
        this.contentCache.set(answerPath, safeContent);
      }
    });
  }

  /**
   * Get all FAQs
   */
  getFAQs(): Observable<FAQItem[]> {
    return this.faqsCache$.asObservable();
  }

  /**
   * Get all FAQs including inactive ones for editor use
   */
  getAllFAQsForEditor(): Observable<FAQItem[]> {
    return this.http.get<SourceFAQRecord[]>(this.FAQ_DATA_URL).pipe(
      map(records => records
        .map(record => this.transformToFAQItem(record))
      ),
      catchError(error => {
        console.error('Failed to load FAQ data for editor', error);
        return of([]);
      })
    );
  }

  /**

   */
  getFAQCount(): Observable<number> {
    return this.getFAQs().pipe(
      map(faqs => faqs.length)
    );
  }

  /**

   */
  getFAQById(id: string): Observable<FAQItem | undefined> {
    return this.getFAQs().pipe(
      map(faqs => faqs.find(faq => faq.id === id))
    );
  }

  /**

   */
  getFAQsByCategory(category: string, subCategory?: string): Observable<FAQItem[]> {
    return this.getFAQs().pipe(
      map(faqs => faqs.filter(faq => {
        const categoryMatch = faq.category === category;
        const subCategoryMatch = !subCategory || faq.subCategory === subCategory;
        return categoryMatch && subCategoryMatch;
      }))
    );
  }

  searchFAQs(query: string, options: SearchOptions = {}): Observable<FAQItem[]> {
    if (!query.trim()) {
      return this.getFAQs();
    }

    return this.performanceService.measure('faq-search', () => {
      return this.getFAQs().pipe(
        map(faqs => this.filterFAQs(faqs, query, options))
      );
    }) as Observable<FAQItem[]>;
  }

  getSearchSuggestions(query: string, maxSuggestions = 8): Observable<string[]> {
    if (!query.trim() || query.length < 2) {
      return of([]);
    }

    return this.getFAQs().pipe(
      map(faqs => {
        const lowerQuery = query.toLowerCase();
        const suggestions = new Set<string>();

        faqs.forEach(faq => {
          if (faq.question.toLowerCase().includes(lowerQuery)) {
            suggestions.add(faq.question);
          }
          if (faq.category.toLowerCase().includes(lowerQuery)) {
            suggestions.add(faq.category);
          }
          if (faq.subCategory?.toLowerCase().includes(lowerQuery)) {
            suggestions.add(faq.subCategory);
          }
        });

        return Array.from(suggestions).slice(0, maxSuggestions);
      })
    );
  }

  private filterFAQs(faqs: FAQItem[], query: string, options: SearchOptions): FAQItem[] {
    const lowerQuery = query.toLowerCase();
    let filtered = faqs.filter(faq => this.matchesFAQ(faq, lowerQuery, options));

    if (options.category) {
      filtered = filtered.filter(faq => faq.category === options.category);
    }

    if (options.subCategory) {
      filtered = filtered.filter(faq => faq.subCategory === options.subCategory);
    }

    if (options.maxResults) {
      filtered = filtered.slice(0, options.maxResults);
    }

    return filtered;
  }

  private matchesFAQ(faq: FAQItem, lowerQuery: string, options: SearchOptions): boolean {
    const questionMatch = faq.question.toLowerCase().includes(lowerQuery);
    const categoryMatch = faq.category.toLowerCase().includes(lowerQuery);
    const subCategoryMatch = faq.subCategory?.toLowerCase().includes(lowerQuery);
    const tagsMatch = faq.tags?.some(tag => tag.toLowerCase().includes(lowerQuery));
    
    let answerMatch = false;
    if (options.includeAnswers && faq.answer) {
      answerMatch = faq.answer.toLowerCase().includes(lowerQuery);
    }

    return questionMatch || categoryMatch || subCategoryMatch || tagsMatch || answerMatch;
  }

  /**

   */
  getFAQContent(answerPath: string): Observable<SafeHtml> {
    if (!answerPath) {
      console.warn('FAQ content requested with empty answerPath');
      return of(this.sanitizer.bypassSecurityTrustHtml('<p class="error-message">Content path not specified</p>'));
    }

    // Check memory cache first - but always reprocess for auto-links if terms are loaded
    if (this.contentCache.has(answerPath)) {

      // If auto-link terms are loaded, we need to reprocess the cached content
      if (this.autoLinkService.isLoaded()) {
        // Get the raw content from local storage to reprocess
        try {
          const cachedContent = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
          if (cachedContent) {
            const parsedCache = JSON.parse(cachedContent);
            const cacheEntry = parsedCache[answerPath];
            
            if (cacheEntry && this.isCacheValid(cacheEntry.timestamp)) {
              const processedContent = this.processContent(cacheEntry.content);
              const safeContent = this.sanitizer.bypassSecurityTrustHtml(processedContent);
              
              // Update memory cache with processed content
              this.contentCache.set(answerPath, safeContent);
              return of(safeContent);
            }
          }
        } catch (error) {
          console.warn('Failed to reprocess cached content:', error);
        }
      }
      
      // Return cached content if no reprocessing needed
      return of(this.contentCache.get(answerPath)!);
    }

    const startTime = performance.now();
    const fullPath = `${this.FAQ_CONTENT_BASE}${answerPath}`;
    
    return this.http.get(fullPath, { responseType: 'text' }).pipe(
      map(content => {
        const processedContent = this.processContent(content);
        const safeContent = this.sanitizer.bypassSecurityTrustHtml(processedContent);

        // Cache content in memory and local storage
        this.contentCache.set(answerPath, safeContent);
        this.saveToLocalStorage(answerPath, content); // Save raw content to local storage
        
        // Track performance
        const loadTime = performance.now() - startTime;
        this.performanceService.trackCustomMetric('faqContentLoadTime', loadTime);
        
        return safeContent;
      }),
      catchError(error => {
        console.error(`Failed to load FAQ content: ${fullPath}`, error);
        const errorContent = this.sanitizer.bypassSecurityTrustHtml(
          `<div class="error-message">
            <p><strong>Failed to load content</strong></p>
            <p>Path: ${fullPath}</p>
            <p>Error: ${error.message || 'Unknown error'}</p>
            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Reload Page</button>
          </div>`
        );
        return of(errorContent);
      })
    );
  }

  /**
   * Get categories list
   */
  getCategories(): Observable<FAQCategory[]> {
    if (this.categoriesCache.length > 0) {
      return of(this.categoriesCache);
    }

    return this.getFAQs().pipe(
      map(faqs => {
        const categoryMap = new Map<string, FAQCategory>();
        
        faqs.forEach(faq => {
          if (!categoryMap.has(faq.category)) {
            categoryMap.set(faq.category, {
              name: faq.category,
              count: 0,
              subCategories: []
            });
          }
          
          const category = categoryMap.get(faq.category)!;
          category.count++;
          
          if (faq.subCategory) {
            const existingSub = category.subCategories.find(sub => sub.name === faq.subCategory);
            if (existingSub) {
              existingSub.count++;
            } else {
              category.subCategories.push({
                name: faq.subCategory,
                count: 1,
                parentCategory: faq.category
              });
            }
          }
        });
        
        this.categoriesCache = Array.from(categoryMap.values());
        
        // Apply specific sorting order for Rules Engines subcategories
        this.categoriesCache.forEach(category => {
          if (category.name === 'Rules Engines') {
            const sortOrder = ['Batch', 'Trigger', 'Data List', 'Action Button', 'Data Loader'];
            category.subCategories.sort((a, b) => {
              const aIndex = sortOrder.indexOf(a.name);
              const bIndex = sortOrder.indexOf(b.name);
              // If both items are in the sort order, sort by their position
              if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
              }
              // If only one item is in the sort order, put it first
              if (aIndex !== -1) return -1;
              if (bIndex !== -1) return 1;
              // If neither item is in the sort order, use alphabetical sorting
              return a.name.localeCompare(b.name);
            });
          }
        });
        
        return this.categoriesCache;
      }),
      shareReplay(1)
    );
  }

  /**

   */
  getTrendingFAQs(ids: string[]): Observable<FAQItem[]> {
    return this.getFAQs().pipe(
      map(faqs => {
        const faqMap = new Map(faqs.map(faq => [faq.id, faq]));
        return ids
          .map(id => faqMap.get(id))
          .filter(Boolean) as FAQItem[];
      })
    );
  }

  /**

   */
  getFAQStats(): Observable<FAQStats> {
    return this.getFAQs().pipe(
      map(faqs => {
        const categories = new Set(faqs.map(faq => faq.category));
        const subCategories = new Set(
          faqs.map(faq => faq.subCategory).filter(Boolean)
        );

        const mostViewed = faqs
          .filter(faq => faq.viewCount && faq.viewCount > 0)
          .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
          .slice(0, 5);

        return {
          totalFAQs: faqs.length,
          totalCategories: categories.size,
          totalSubCategories: subCategories.size,
          mostViewedFAQs: mostViewed,
          recentlyUpdated: []
        };
      })
    );
  }

  /**
   * Update FAQ item
   */
  updateFAQItem(id: string, updates: Partial<FAQItem>): void {
    const currentFAQs = this.faqsCache$.value;
    const updatedFAQs = currentFAQs.map(faq => 
      faq.id === id ? { ...faq, ...updates } : faq
    );
    this.faqsCache$.next(updatedFAQs);
  }

  /**
   * Get all FAQs synchronously
   */
  getAllFAQs(): FAQItem[] {
    return this.faqsCache$.value;
  }

  /**
   * Get FAQ content by ID
   */
  getFAQContentById(id: string): Observable<SafeHtml> {
    const faq = this.faqsCache$.value.find(f => f.id === id);
    if (!faq) {
      return of(this.sanitizer.bypassSecurityTrustHtml('<p>FAQ not found</p>'));
    }
    return this.getFAQContent(faq.answerPath);
  }

  /**

   */
  clearContentCache(): void {
    this.contentCache.clear();
    // Also clear localStorage cache
    try {
      localStorage.removeItem(this.STORAGE_KEY_FAQ_CONTENT);
    } catch (error) {
      console.warn('Failed to clear FAQ content from localStorage:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { memoryCount: number, localStorageCount: number, totalSize: number, expiredCount: number } {
    let localStorageCount = 0;
    let totalSize = 0;
    let expiredCount = 0;
    
    try {
      const cachedContent = localStorage.getItem(this.STORAGE_KEY_FAQ_CONTENT);
      if (cachedContent) {
        totalSize = cachedContent.length;
        const cache = JSON.parse(cachedContent);
        
        Object.entries(cache).forEach(([key, value]: [string, any]) => {
          localStorageCount++;
          if (!this.isCacheValid(value.timestamp)) {
            expiredCount++;
          }
        });
      }
    } catch (error) {
      console.warn('Failed to get cache stats:', error);
    }
    
    return {
      memoryCount: this.contentCache.size,
      localStorageCount,
      totalSize,
      expiredCount
    };
  }

  /**
   * Force cache cleanup
   */
  forceCleanup(): void {
    this.cleanExpiredCache();
    this.cleanExpiredMemoryCache();
    const stats = this.getCacheStats();
  }

  /**

   */
  reloadFAQs(): Observable<FAQItem[]> {
    this.categoriesCache = [];
    this.clearContentCache();
    
    // Return the actual HTTP request Observable, not the current cache
    this.isLoading = true;
    
    return this.http.get<SourceFAQRecord[]>(this.FAQ_DATA_URL).pipe(
      map(records => {
        const activeRecords = records.filter(record => record.isActive !== false);
        const transformedFAQs = activeRecords.map(record => this.transformToFAQItem(record));
        return transformedFAQs;
      }),
      tap(faqs => {
        this.faqsCache$.next(faqs);
      }),
      catchError(error => {
        console.error('Failed to reload FAQ data:', error);
        return of([]);
      }),
      finalize(() => {
        this.isLoading = false;
      })
    );
  }

  /**
   * Private method: Load FAQ data
   */
  private loadFAQs(): void {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.http.get<SourceFAQRecord[]>(this.FAQ_DATA_URL).pipe(
      map(records => records
        .filter(record => record.isActive !== false) // Filter out inactive FAQs
        .map(record => this.transformToFAQItem(record))
      ),
      catchError(error => {
        console.error('Failed to load FAQ data', error);
        return of([]);
      }),
      finalize(() => this.isLoading = false)
    ).subscribe(faqs => {
      this.faqsCache$.next(faqs);
    });
  }

  /**
   * Private method: Transform raw data to FAQ item
   */
  private transformToFAQItem(record: SourceFAQRecord): FAQItem {
    return {
      id: record.Id,
      question: record.Question__c || '',
      answer: '',
      answerPath: record.Answer__c || '',
      category: record.Category__c || '',
      subCategory: record.SubCategory__c,
      isExpanded: false,
      userRating: null,
      viewCount: 0,
      isPopular: false,
      isLoading: false,
      tags: record.SubCategory__c ?
        [record.Category__c, record.SubCategory__c] :
        [record.Category__c],
      lastUpdated: new Date(),
      isActive: record.isActive !== false // Default to true if not specified
    };
  }

  /**
   * Check if browser supports WebP format
   */
  private supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }

  /**
   * Convert image source to WebP if supported and available
   */
  private getOptimizedImageSrc(originalSrc: string): string {
    if (!this.supportsWebP()) {
      return originalSrc;
    }

    // Convert common image extensions to WebP variants
    const webpSrc = originalSrc
      .replace(/\.(jpg|jpeg|png)$/i, '.webp')
      .replace(/\.(jpg|jpeg|png)\?/i, '.webp?');

    return webpSrc;
  }

  /**
   * Create responsive image with proper error handling
   */
  private createResponsiveImage(src: string, attrs: string): string {
    // Extract alt text
    const altMatch = attrs.match(/alt="([^"]*)"/);
    const alt = altMatch ? altMatch[1] : 'FAQ Image';
    
    // Normalize the image source URL
    let normalizedSrc = src;
    
    // Handle different URL patterns
    if (src.startsWith('http') || src.startsWith('//')) {
      // External URL - use as is
      normalizedSrc = src;
    } else if (src.startsWith('/')) {
      // Absolute path - use as is
      normalizedSrc = src;
    } else if (src.startsWith('assets/')) {
      // Already correctly formatted - ensure proper path
      normalizedSrc = src;
    } else {
      // Relative path - ensure it starts with assets/
      normalizedSrc = `assets/${src}`;
    }

    // Create container with comprehensive error handling
    return `<div class="faq-picture">
      <img 
        src="${normalizedSrc}" 
        alt="${alt}"
        class="faq-image"
        style="display: block; margin: 20px auto; max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease;"
        loading="lazy"
        onload="if(this.parentElement){this.parentElement.classList.add('image-loaded')}"
            >
    </div>`;
  }

  /**
   * Private method: Processes FAQ content
   */
  private processContent(content: string): string {
    
    let processedContent = content
      // Remove empty p tags but preserve content structure
      .replace(/<p[^>]*>\s*<\/p>/g, '')
      // Improve content formatting
      .replace(/<section[^>]*>/g, '<div class="faq-section">')
      .replace(/<\/section>/g, '</div>')
      // Process FAQ internal links with centralized URL management
      .replace(/<a([^>]*?)href="([^"]*)"([^>]*?)>/g, (match, beforeHref, href, afterHref) => {
        // Check if this is an internal FAQ link
        if (href.startsWith('/') && !href.startsWith('http')) {
          // Check if there's a data-faq-link attribute
          const faqLinkMatch = match.match(/data-faq-link="([^"]*)"/);
          if (faqLinkMatch) {
            const linkKey = faqLinkMatch[1];
            const resolvedUrl = getFAQUrlByKey(linkKey);
            if (resolvedUrl) {
              // Replace the href with the resolved URL, preserve existing classes
              return `<a${beforeHref}href="${resolvedUrl}"${afterHref}>`;
            }
          }
          
          // Only add faq-internal-link class if no existing class is present
          const hasClass = beforeHref.includes('class=') || afterHref.includes('class=');
          if (!hasClass) {
            return `<a${beforeHref}href="${href}"${afterHref} class="faq-internal-link">`;
          }
        }
        return match;
      })
      // Enhanced image processing with better URL handling
      .replace(/<img([^>]*?)>/g, (match, attrs) => {
        const srcMatch = attrs.match(/src="([^"]*)"/);
        if (!srcMatch) {
          console.warn('Image tag without src attribute:', match);
          return match;
        }

        const originalSrc = srcMatch[1];

        // Handle specific problematic URLs
        if (originalSrc.includes('undefined') || originalSrc.trim() === '') {
          console.warn('Invalid image src detected:', originalSrc);
          return `<div class="faq-picture image-error">
            <div style="padding: 20px; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; text-align: center; color: #6c757d; font-style: italic;">
              🖼️ Invalid image URL detected
            </div>
          </div>`;
        }

        return this.createResponsiveImage(originalSrc, attrs);
      });
      
    // Apply auto-link terms after all other processing
    processedContent = this.autoLinkService.applyAutoLinkTerms(processedContent);
    
    // Clean up extra whitespace but preserve line breaks in content
    // Be careful not to break HTML attributes
    return processedContent
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }


  /**
   * Check version and clear cache if needed
   */
  public async checkAndUpdateVersion(): Promise<void> {
    try {
      // Check if we need to skip this check due to interval
      const localVersionData = localStorage.getItem(this.STORAGE_KEY_APP_VERSION);
      if (localVersionData) {
        const versionInfo = JSON.parse(localVersionData);
        const lastCheckTime = versionInfo.lastCheckTime || 0;
        const timeSinceLastCheck = Date.now() - lastCheckTime;
        
        if (timeSinceLastCheck < this.VERSION_CHECK_INTERVAL) {
          const minutesAgo = Math.round(timeSinceLastCheck / 1000 / 60);
          return;
        }
      }
      
      // Get remote version
      const response = await this.http.get<any>(this.VERSION_URL).toPromise();
      const remoteVersion = response.build || response.version;
      
      // Get local version
      const localVersion = localVersionData ? JSON.parse(localVersionData).build : null;
      
      if (!localVersion || localVersion !== remoteVersion) {
        this.clearAllCaches();
        
        // Save new version with reset check time
        localStorage.setItem(this.STORAGE_KEY_APP_VERSION, JSON.stringify({
          build: remoteVersion,
          version: response.version,
          timestamp: Date.now(),
          lastCheckTime: Date.now()
        }));
        
        // Silent automatic page refresh
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        // Update last check time even if no version change
        const currentVersionInfo = localVersionData ? JSON.parse(localVersionData) : {};
        localStorage.setItem(this.STORAGE_KEY_APP_VERSION, JSON.stringify({
          ...currentVersionInfo,
          lastCheckTime: Date.now()
        }));
      }
    } catch (error) {
      console.error('❌ Failed to check version:', error);
      // If version check fails, continue with normal operation
    }
  }

  /**
   * Clear all caches except editor IndexedDB data
   */
  private clearAllCaches(): void {
    try {
      // Preserve version info during localStorage clearing
      const versionData = localStorage.getItem(this.STORAGE_KEY_APP_VERSION);
      
      // Clear all localStorage
      localStorage.clear();
      
      // Restore version info
      if (versionData) {
        localStorage.setItem(this.STORAGE_KEY_APP_VERSION, versionData);
      }
      
      // Clear all sessionStorage (including preview data)
      sessionStorage.clear();
      
      // Clear memory caches
      this.contentCache.clear();
      this.categoriesCache = [];
      
      // Note: IndexedDB (FAQEditorDB, RecipeEditorDB) is automatically preserved
      
    } catch (error) {
      console.error('❌ Failed to clear caches:', error);
    }
  }
}
