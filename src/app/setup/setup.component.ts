import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SetupService } from './services/setup.service';
import { Page, Block, SetupIndexItem } from './models/setup.model';

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private observer: IntersectionObserver | null = null;

  setupIndex: SetupIndexItem[] = [];
  currentSetup: Page | null = null;
  currentSlug: string | null = null;
  isLoading = true;
  activeBlockId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private setupService: SetupService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadIndex();
  }

  ngAfterViewInit(): void {
    this.setupScrollObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.observer?.disconnect();
  }

  private setupScrollObserver(): void {
    this.observer?.disconnect();

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Get the topmost visible entry
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
          );
          this.activeBlockId = topEntry.target.id;
          this.cdr.markForCheck();
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0
      }
    );

    // Observe all H2 block elements after content loads
    setTimeout(() => {
      this.h2Blocks.forEach(block => {
        const id = this.getBlockId(block.content || '');
        const element = document.getElementById(id);
        if (element) {
          this.observer?.observe(element);
        }
      });
    });
  }

  private loadIndex(): void {
    this.setupService.getSetupIndex()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (index) => {
          this.setupIndex = index.filter(item => item.active);
          this.watchRoute();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private watchRoute(): void {
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const slug = params.get('setupSlug');
        if (slug) {
          this.loadSetup(slug);
        } else if (this.setupIndex.length > 0) {
          this.router.navigate(['/setup', this.setupIndex[0].slug]);
        } else {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadSetup(slug: string): void {
    this.currentSlug = slug;
    this.isLoading = true;
    this.cdr.markForCheck();

    this.setupService.getSetupBySlug(slug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (setup) => {
          this.currentSetup = setup;
          this.isLoading = false;
          this.activeBlockId = null;
          this.cdr.markForCheck();
          this.setupScrollObserver();
        },
        error: () => {
          this.currentSetup = null;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  get h2Blocks(): Block[] {
    if (!this.currentSetup?.blocks) return [];
    return this.currentSetup.blocks.filter(b => b.type === 'h2');
  }

  selectSetup(slug: string): void {
    this.router.navigate(['/setup', slug]);
  }

  scrollToBlock(content: string): void {
    const id = this.getBlockId(content);
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
    }
  }

  getBlockId(content: string): string {
    return 'block-' + (content || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  trackBySlug(_: number, item: SetupIndexItem): string {
    return item.slug;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
