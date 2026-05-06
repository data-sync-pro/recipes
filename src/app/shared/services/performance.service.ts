import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  
  // Other metrics
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
  
  // Custom metrics
  faqListRenderTime?: number;
  faqContentLoadTime?: number;
  searchResponseTime?: number;
  
  // Navigation timing
  navigationStart?: number;
  domContentLoaded?: number;
  loadComplete?: number;
  
  timestamp: number;
}

export interface PerformanceAlert {
  type: 'lcp' | 'fid' | 'cls' | 'custom';
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'error';
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PerformanceService {
  private metricsSubject = new BehaviorSubject<PerformanceMetrics>({ timestamp: Date.now() });
  private alertsSubject = new BehaviorSubject<PerformanceAlert[]>([]);
  
  private metrics: PerformanceMetrics = { timestamp: Date.now() };
  private alerts: PerformanceAlert[] = [];
  
  // Performance thresholds (in milliseconds for timing, unitless for CLS)
  private thresholds = {
    lcp: { warning: 2500, error: 4000 },
    fid: { warning: 100, error: 300 },
    cls: { warning: 0.1, error: 0.25 },
    fcp: { warning: 1800, error: 3000 },
    ttfb: { warning: 800, error: 1800 },
    faqListRenderTime: { warning: 100, error: 300 },
    faqContentLoadTime: { warning: 500, error: 1000 },
    searchResponseTime: { warning: 200, error: 500 }
  };

  constructor() {
    this.initializePerformanceObserver();
    this.observeNavigationTiming();
    this.observeResourceTiming();
  }

  /**
   * Get performance metrics as Observable
   */
  get metrics$() {
    return this.metricsSubject.asObservable();
  }

  /**
   * Get performance alerts as Observable
   */
  get alerts$() {
    return this.alertsSubject.asObservable();
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Initialize Performance Observer for Core Web Vitals
   */
  private initializePerformanceObserver(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    try {
      // Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        if (lastEntry) {
          this.updateMetric('lcp', lastEntry.startTime);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          this.updateMetric('fid', entry.processingStart - entry.startTime);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.updateMetric('cls', clsValue);
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // First Contentful Paint (FCP)
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.name === 'first-contentful-paint') {
            this.updateMetric('fcp', entry.startTime);
          }
        });
      });
      fcpObserver.observe({ entryTypes: ['paint'] });

    } catch (error) {
      console.warn('PerformanceObserver not fully supported:', error);
    }
  }

  /**
   * Observe navigation timing
   */
  private observeNavigationTiming(): void {
    if (typeof window === 'undefined') return;

    const timing = performance.timing;
    
    // Wait for page load
    fromEvent(window, 'load').pipe(
      debounceTime(100)
    ).subscribe(() => {
      this.updateMetric('navigationStart', timing.navigationStart);
      this.updateMetric('domContentLoaded', timing.domContentLoadedEventEnd - timing.navigationStart);
      this.updateMetric('loadComplete', timing.loadEventEnd - timing.navigationStart);
      this.updateMetric('ttfb', timing.responseStart - timing.navigationStart);
    });
  }

  /**
   * Observe resource timing
   */
  private observeResourceTiming(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    try {
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          // Track FAQ-related resources. Index loads count as list render time;
          // per-FAQ faq.json or answer.html count as content load time.
          if (entry.name.includes('/assets/faqs/')) {
            const loadTime = entry.responseEnd - entry.startTime;
            if (entry.name.endsWith('/index.json')) {
              this.updateMetric('faqListRenderTime', loadTime);
            } else {
              this.updateMetric('faqContentLoadTime', loadTime);
            }
          }
        });
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
    } catch (error) {
      console.warn('Resource timing observer failed:', error);
    }
  }

  /**
   * Manually track custom performance metrics
   */
  trackCustomMetric(name: keyof PerformanceMetrics, value: number): void {
    this.updateMetric(name, value);
  }

  /**
   * Measure operation performance
   */
  measure<T>(name: string, operation: () => T | Promise<T>): T | Promise<T> {
    const startTime = performance.now();
    
    const result = operation();
    
    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - startTime;

        // Track specific FAQ operations
        if (name.includes('search')) {
          this.trackCustomMetric('searchResponseTime', duration);
        } else if (name.includes('render')) {
          this.trackCustomMetric('faqListRenderTime', duration);
        } else if (name.includes('content')) {
          this.trackCustomMetric('faqContentLoadTime', duration);
        }
      });
    } else {
      const duration = performance.now() - startTime;
      return result;
    }
  }

  /**
   * Update a specific metric
   */
  private updateMetric(name: keyof PerformanceMetrics, value: number): void {
    this.metrics = {
      ...this.metrics,
      [name]: value,
      timestamp: Date.now()
    };
    
    this.checkThreshold(name, value);
    this.metricsSubject.next(this.metrics);
  }

  /**
   * Check if metric exceeds threshold
   */
  private checkThreshold(metric: keyof PerformanceMetrics, value: number): void {
    const threshold = this.thresholds[metric as keyof typeof this.thresholds];
    if (!threshold) return;

    let severity: 'warning' | 'error' | null = null;
    
    if (value >= threshold.error) {
      severity = 'error';
    } else if (value >= threshold.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert: PerformanceAlert = {
        type: ['lcp', 'fid', 'cls'].includes(metric) ? metric as any : 'custom',
        metric,
        value,
        threshold: severity === 'error' ? threshold.error : threshold.warning,
        severity,
        timestamp: Date.now()
      };

      this.alerts.push(alert);
      this.alertsSubject.next([...this.alerts]);
      
      //console.warn(`Performance Alert (${severity}): ${metric} = ${value}ms, threshold = ${alert.threshold}ms`);
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    coreWebVitals: { lcp?: number; fid?: number; cls?: number };
    customMetrics: { faqListRenderTime?: number; faqContentLoadTime?: number; searchResponseTime?: number };
    alerts: PerformanceAlert[];
  } {
    return {
      coreWebVitals: {
        lcp: this.metrics.lcp,
        fid: this.metrics.fid,
        cls: this.metrics.cls
      },
      customMetrics: {
        faqListRenderTime: this.metrics.faqListRenderTime,
        faqContentLoadTime: this.metrics.faqContentLoadTime,
        searchResponseTime: this.metrics.searchResponseTime
      },
      alerts: [...this.alerts]
    };
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
    this.alertsSubject.next([]);
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      alerts: this.alerts,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}