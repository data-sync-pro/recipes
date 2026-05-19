import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { Store } from '../../core/store/recipe.store';
import { TIMING } from '../constants/timing.constants';
import { INTERSECTION_CONFIG } from '../constants/observer.constants';
import { RECIPE_SECTIONS } from '../../core/constants/recipe.constants';

export interface NavigationEvent {
  type: 'section-changed' | 'user-scrolled';
  sectionId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NavigationService {

  private readonly SECTION_ID_PREFIX = 'recipe-';
  private readonly STEP_ID_PREFIX = RECIPE_SECTIONS.STEP_PREFIX;
  private readonly SECTION_SELECTOR = `[id^="recipe-"], [id^="${RECIPE_SECTIONS.STEP_PREFIX}"]`;

  private navigationEvent$ = new Subject<NavigationEvent>();
  private navigationEvents$?: Observable<NavigationEvent>;

  private optimizedScrollListener?: () => void;

  private sectionObserver?: IntersectionObserver;
  private visibleSections = new Set<string>();

  private cachedSections: Element[] = [];

  private scrollDirection: 'up' | 'down' = 'down';
  private lastScrollY: number = 0;

  constructor(private store: Store) { }

  getNavigationEvents(): Observable<NavigationEvent> {
    if (!this.navigationEvents$) {
      this.navigationEvents$ = this.navigationEvent$.pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.navigationEvents$;
  }

  setupOptimizedScrollListener(): void {
    if (typeof window === 'undefined') return;

    this.optimizedScrollListener = () => {
      const currentScrollY = window.scrollY;
      this.scrollDirection = currentScrollY > this.lastScrollY ? 'down' : 'up';
      this.lastScrollY = currentScrollY;

      if (!this.store.getUIState().userHasScrolled) {
        this.store.markUserScrolled();
        this.navigationEvent$.next({ type: 'user-scrolled' });
      }
    };

    window.addEventListener('scroll', this.optimizedScrollListener, { passive: true });
  }

  setupSectionObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: `-${INTERSECTION_CONFIG.HEADER_OFFSET}px 0px -${INTERSECTION_CONFIG.BOTTOM_MARGIN}px 0px`,
      threshold: [...INTERSECTION_CONFIG.THRESHOLDS]
    };

    this.sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const sectionId = entry.target.id;
        if (entry.isIntersecting && entry.intersectionRatio >= INTERSECTION_CONFIG.VISIBILITY_THRESHOLD) {
          this.visibleSections.add(sectionId);
        } else if (!entry.isIntersecting || entry.intersectionRatio < INTERSECTION_CONFIG.VISIBILITY_THRESHOLD) {
          this.visibleSections.delete(sectionId);
        }
      });

      if (this.visibleSections.size > 0) {
        const firstVisible = this.getFirstVisibleSectionInDOMOrder();
        if (firstVisible) {
          this.updateActiveSection(firstVisible);
        }
      }
    }, options);
  }

  observeAllSections(overviewElementIds: string[], walkthroughStepCount: number): void {
    if (!this.sectionObserver) return;

    const allElementIds: string[] = [...overviewElementIds];
    for (let i = 0; i < walkthroughStepCount; i++) {
      allElementIds.push(`${this.STEP_ID_PREFIX}${i}`);
    }

    requestAnimationFrame(() => {
      overviewElementIds.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
          this.sectionObserver?.observe(element);
        }
      });

      for (let i = 0; i < walkthroughStepCount; i++) {
        const element = document.getElementById(`${this.STEP_ID_PREFIX}${i}`);
        if (element) {
          this.sectionObserver?.observe(element);
        }
      }

      this.cachedSections = Array.from(document.querySelectorAll(this.SECTION_SELECTOR));

      this.detectInitialVisibleSection(allElementIds);
    });
  }

  private calculateObservationBoundaries(): { observeTop: number; observeBottom: number } {
    const headerOffset = INTERSECTION_CONFIG.HEADER_OFFSET;
    const bottomMargin = INTERSECTION_CONFIG.BOTTOM_MARGIN;
    const viewportHeight = window.innerHeight;

    return {
      observeTop: window.scrollY + headerOffset,
      observeBottom: window.scrollY + viewportHeight - bottomMargin
    };
  }

  private updateActiveSection(sectionId: string): void {
    const currentSectionId = this.store.getUIState().activeSectionId;
    if (currentSectionId !== sectionId) {
      this.store.setActiveSectionId(sectionId);
      this.navigationEvent$.next({
        type: 'section-changed',
        sectionId: sectionId
      });
    }
  }

  private detectInitialVisibleSection(elementIds: string[]): void {
    const { observeTop, observeBottom } = this.calculateObservationBoundaries();

    let bestSection: { id: string; visibleRatio: number } | null = null;

    for (const elementId of elementIds) {
      const element = document.getElementById(elementId);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      const elementTop = window.scrollY + rect.top;
      const elementBottom = elementTop + rect.height;

      const visibleTop = Math.max(elementTop, observeTop);
      const visibleBottom = Math.min(elementBottom, observeBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      const visibleRatio = visibleHeight / rect.height;

      if (visibleRatio >= INTERSECTION_CONFIG.VISIBILITY_THRESHOLD) {
        if (!bestSection || visibleRatio > bestSection.visibleRatio) {
          bestSection = { id: elementId, visibleRatio };
        }
      }
    }

    if (bestSection) {
      this.visibleSections.add(bestSection.id);
      this.updateActiveSection(bestSection.id);
    }
  }

  private getFirstVisibleSectionInDOMOrder(): string | null {
    if (this.visibleSections.size === 0) return null;

    if (this.visibleSections.size === 1) {
      return Array.from(this.visibleSections)[0];
    }

    if (this.cachedSections.length === 0) {
      this.cachedSections = Array.from(document.querySelectorAll(this.SECTION_SELECTOR));
    }
    const allSections = this.cachedSections;

    const { observeTop, observeBottom } = this.calculateObservationBoundaries();

    let bestSection: { id: string; visibleRatio: number; index: number } | null = null;

    allSections.forEach((section: Element, index: number) => {
      if (!section.id || !this.visibleSections.has(section.id)) return;

      const rect = section.getBoundingClientRect();
      const elementTop = window.scrollY + rect.top;
      const elementBottom = elementTop + rect.height;

      const visibleTop = Math.max(elementTop, observeTop);
      const visibleBottom = Math.min(elementBottom, observeBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleRatio = visibleHeight / rect.height;

      if (!bestSection || visibleRatio > bestSection.visibleRatio) {
        bestSection = { id: section.id, visibleRatio, index };
      } else if (Math.abs(visibleRatio - bestSection.visibleRatio) < 0.05) {
        if (this.scrollDirection === 'down' && index > bestSection.index) {
          bestSection = { id: section.id, visibleRatio, index };
        } else if (this.scrollDirection === 'up' && index < bestSection.index) {
          bestSection = { id: section.id, visibleRatio, index };
        }
      }
    });

    return (bestSection as { id: string; visibleRatio: number; index: number } | null)?.id || Array.from(this.visibleSections)[0] || null;
  }

  navigateToOverviewSection(sectionId: string): void {
    this.scrollToSection(sectionId);
  }

  navigateToWalkthroughSection(stepIndex: number): void {
    this.scrollToSection(`${this.STEP_ID_PREFIX}${stepIndex}`);
  }

  private scrollToSection(elementId: string): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      this.updateUrlHash(elementId);

      this.store.setActiveSectionId(elementId);
      this.navigationEvent$.next({
        type: 'section-changed',
        sectionId: elementId
      });
    }
  }

  private updateUrlHash(sectionId: string): void {
    if (typeof window !== 'undefined' && window.history) {
      const currentUrl = window.location.pathname + window.location.search;
      const newUrl = `${currentUrl}#${sectionId}`;
      window.history.replaceState(null, '', newUrl);
    }
  }

  handleInitialHash(): void {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });

            this.store.setActiveSectionId(hash);
            this.navigationEvent$.next({
              type: 'section-changed',
              sectionId: hash
            });
          }
        }, TIMING.INITIAL_HASH_DELAY);
      });
    }
  }

  cleanup(): void {
    if (this.optimizedScrollListener) {
      window.removeEventListener('scroll', this.optimizedScrollListener);
      this.optimizedScrollListener = undefined;
    }

    if (this.sectionObserver) {
      this.sectionObserver.disconnect();
      this.sectionObserver = undefined;
    }

    this.visibleSections.clear();
    this.cachedSections = [];
  }
}
