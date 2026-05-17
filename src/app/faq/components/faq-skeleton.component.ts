import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-faq-skeleton',
  template: `
    <div class="faq-skeleton-container">
      <!-- FAQ List Skeleton -->
      <div class="faq-skeleton-list" *ngIf="type === 'list'">
        <div class="skeleton-item" *ngFor="let item of getSkeletonItems(count)">
          <div class="skeleton-header">
            <div class="skeleton-title">
              <div class="skeleton-line skeleton-line-title"></div>
              <div class="skeleton-badges">
                <div class="skeleton-badge"></div>
                <div class="skeleton-badge"></div>
              </div>
            </div>
            <div class="skeleton-arrow"></div>
          </div>
        </div>
      </div>

      <!-- FAQ Detail Skeleton -->
      <div class="faq-skeleton-detail" *ngIf="type === 'detail'">
        <div class="skeleton-detail-header">
          <div class="skeleton-line skeleton-line-large"></div>
          <div class="skeleton-line skeleton-line-medium"></div>
        </div>
        <div class="skeleton-detail-content">
          <div class="skeleton-line skeleton-line-full" *ngFor="let line of getSkeletonItems(6)"></div>
          <div class="skeleton-line skeleton-line-half"></div>
        </div>
      </div>

      <!-- Search Results Skeleton -->
      <div class="faq-skeleton-search" *ngIf="type === 'search'">
        <div class="skeleton-search-info">
          <div class="skeleton-line skeleton-line-small"></div>
        </div>
        <div class="skeleton-item" *ngFor="let item of getSkeletonItems(count)">
          <div class="skeleton-search-result">
            <div class="skeleton-line skeleton-line-title"></div>
            <div class="skeleton-line skeleton-line-medium"></div>
            <div class="skeleton-line skeleton-line-small"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .faq-skeleton-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }

    .skeleton-item {
      background: #ffffff;
      border: 1px solid #e1e5e9;
      border-radius: 12px;
      margin-bottom: 16px;
      padding: 24px 28px;
      animation: skeleton-pulse 1.5s ease-in-out infinite alternate;
    }

    .skeleton-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .skeleton-title {
      flex: 1;
      min-width: 0;
    }

    .skeleton-line {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skeleton-shimmer 1.5s infinite;
      margin-bottom: 8px;
    }

    .skeleton-line-title {
      height: 20px;
      width: 75%;
    }

    .skeleton-line-medium {
      height: 16px;
      width: 50%;
    }

    .skeleton-line-small {
      height: 14px;
      width: 30%;
    }

    .skeleton-line-large {
      height: 24px;
      width: 90%;
    }

    .skeleton-line-full {
      height: 16px;
      width: 100%;
    }

    .skeleton-line-half {
      height: 16px;
      width: 60%;
    }

    .skeleton-badges {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .skeleton-badge {
      height: 20px;
      width: 60px;
      background: #e0e0e0;
      border-radius: 10px;
      animation: skeleton-shimmer 1.5s infinite;
    }

    .skeleton-arrow {
      width: 20px;
      height: 20px;
      background: #e0e0e0;
      border-radius: 50%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    .skeleton-detail-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e9ecef;
    }

    .skeleton-detail-content {
      margin-bottom: 40px;
    }

    .skeleton-search-info {
      margin-bottom: 20px;
    }

    .skeleton-search-result {
      padding: 16px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    @keyframes skeleton-shimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }

    @keyframes skeleton-pulse {
      0% {
        opacity: 1;
      }
      100% {
        opacity: 0.7;
      }
    }

    @media (max-width: 768px) {
      .faq-skeleton-container {
        padding: 16px;
      }

      .skeleton-item {
        padding: 16px 20px;
      }

      .skeleton-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .skeleton-badges {
        flex-wrap: wrap;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FaqSkeletonComponent {
  @Input() type: 'list' | 'detail' | 'search' = 'list';
  @Input() count: number = 5;

  getSkeletonItems(count: number): number[] {
    return Array(count).fill(0).map((_, i) => i);
  }
}