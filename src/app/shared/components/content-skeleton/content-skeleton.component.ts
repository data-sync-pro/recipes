import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Generic shimmering content placeholder shown while a page's data loads on
 * first entry. Shared across the recipe, user manual, transformation and FAQ
 * sections so the loading experience is consistent. The shimmer matches the
 * FAQ skeleton (`app-faq-skeleton`).
 */
@Component({
  selector: 'app-content-skeleton',
  template: `
    <div class="content-skeleton" role="status" aria-label="Loading content">
      <div class="sk-line sk-title"></div>
      <div class="sk-block" *ngFor="let block of range(blocks)">
        <div class="sk-line sk-heading"></div>
        <div class="sk-line sk-full"></div>
        <div class="sk-line sk-full"></div>
        <div class="sk-line sk-wide"></div>
        <div class="sk-line sk-half"></div>
      </div>
    </div>
  `,
  styles: [`
    .content-skeleton {
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
      padding: 8px 0 40px;
    }

    .sk-line {
      background: linear-gradient(90deg, #f0f0f0 25%, #e4e7ea 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      border-radius: 6px;
      animation: content-skeleton-shimmer 1.5s infinite;
    }

    .sk-title {
      height: 32px;
      width: 45%;
      margin-bottom: 32px;
    }

    .sk-block {
      margin-bottom: 36px;
    }

    .sk-heading {
      height: 22px;
      width: 30%;
      margin-bottom: 18px;
    }

    .sk-full { height: 14px; width: 100%; margin-bottom: 12px; }
    .sk-wide { height: 14px; width: 85%; margin-bottom: 12px; }
    .sk-half { height: 14px; width: 55%; }

    @keyframes content-skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContentSkeletonComponent {
  /** Number of paragraph blocks rendered below the title bar. */
  @Input() blocks = 3;

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
