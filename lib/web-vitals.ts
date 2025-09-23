// lib/web-vitals.ts
// Professional Web Vitals monitoring and performance tracking
import { logger } from './logger';
import { monitoringService } from './monitoring';

export interface WebVitalsMetrics {
  CLS: number; // Cumulative Layout Shift
  FID: number; // First Input Delay
  FCP: number; // First Contentful Paint
  LCP: number; // Largest Contentful Paint
  TTFB: number; // Time to First Byte
  INP: number; // Interaction to Next Paint
}

export interface PerformanceMetrics {
  navigation: {
    loadTime: number;
    domContentLoaded: number;
    firstPaint: number;
    firstContentfulPaint: number;
  };
  resources: {
    totalSize: number;
    resourceCount: number;
    loadTime: number;
  };
  userTiming: {
    [key: string]: number;
  };
}

class WebVitalsService {
  private metrics: Partial<WebVitalsMetrics> = {};
  private performanceMetrics: Partial<PerformanceMetrics> = {};
  private observers: PerformanceObserver[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeWebVitals();
      this.initializePerformanceMonitoring();
    }
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private initializeWebVitals(): void {
    // CLS (Cumulative Layout Shift)
    this.observeCLS();
    
    // FID (First Input Delay)
    this.observeFID();
    
    // FCP (First Contentful Paint)
    this.observeFCP();
    
    // LCP (Largest Contentful Paint)
    this.observeLCP();
    
    // TTFB (Time to First Byte)
    this.observeTTFB();
    
    // INP (Interaction to Next Paint)
    this.observeINP();
  }

  /**
   * Observe Cumulative Layout Shift
   */
  private observeCLS(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        let clsValue = 0;
        
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        
        this.metrics.CLS = clsValue;
        this.reportMetric('CLS', clsValue);
      });
      
      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe CLS', { error });
    }
  }

  /**
   * Observe First Input Delay
   */
  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fid = (entry as any).processingStart - entry.startTime;
          this.metrics.FID = fid;
          this.reportMetric('FID', fid);
        }
      });
      
      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe FID', { error });
    }
  }

  /**
   * Observe First Contentful Paint
   */
  private observeFCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.FCP = entry.startTime;
            this.reportMetric('FCP', entry.startTime);
          }
        }
      });
      
      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe FCP', { error });
    }
  }

  /**
   * Observe Largest Contentful Paint
   */
  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        
        this.metrics.LCP = lastEntry.startTime;
        this.reportMetric('LCP', lastEntry.startTime);
      });
      
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe LCP', { error });
    }
  }

  /**
   * Observe Time to First Byte
   */
  private observeTTFB(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const ttfb = (entry as any).responseStart - (entry as any).requestStart;
            this.metrics.TTFB = ttfb;
            this.reportMetric('TTFB', ttfb);
          }
        }
      });
      
      observer.observe({ type: 'navigation', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe TTFB', { error });
    }
  }

  /**
   * Observe Interaction to Next Paint
   */
  private observeINP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const inp = entry.startTime + entry.duration;
          this.metrics.INP = inp;
          this.reportMetric('INP', inp);
        }
      });
      
      observer.observe({ type: 'event', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe INP', { error });
    }
  }

  /**
   * Initialize general performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    // Monitor navigation timing
    this.observeNavigationTiming();
    
    // Monitor resource timing
    this.observeResourceTiming();
    
    // Monitor user timing
    this.observeUserTiming();
  }

  /**
   * Observe navigation timing
   */
  private observeNavigationTiming(): void {
    if (performance.getEntriesByType) {
      const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      
      if (navigationEntries.length > 0) {
        const nav = navigationEntries[0];
        
        this.performanceMetrics.navigation = {
          loadTime: nav.loadEventEnd - nav.loadEventStart,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          firstPaint: 0, // Will be set by paint observer
          firstContentfulPaint: 0 // Will be set by paint observer
        };
        
        // Get paint metrics
        const paintEntries = performance.getEntriesByType('paint');
        for (const entry of paintEntries) {
          if (entry.name === 'first-paint') {
            this.performanceMetrics.navigation!.firstPaint = entry.startTime;
          } else if (entry.name === 'first-contentful-paint') {
            this.performanceMetrics.navigation!.firstContentfulPaint = entry.startTime;
          }
        }
      }
    }
  }

  /**
   * Observe resource timing
   */
  private observeResourceTiming(): void {
    if (performance.getEntriesByType) {
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      
      let totalSize = 0;
      let totalLoadTime = 0;
      
      for (const entry of resourceEntries) {
        totalSize += entry.transferSize || 0;
        totalLoadTime += entry.duration;
      }
      
      this.performanceMetrics.resources = {
        totalSize,
        resourceCount: resourceEntries.length,
        loadTime: totalLoadTime
      };
    }
  }

  /**
   * Observe user timing
   */
  private observeUserTiming(): void {
    if (performance.getEntriesByType) {
      const userTimingEntries = performance.getEntriesByType('measure');
      const userTiming: { [key: string]: number } = {};
      
      for (const entry of userTimingEntries) {
        userTiming[entry.name] = entry.duration;
      }
      
      this.performanceMetrics.userTiming = userTiming;
    }
  }

  /**
   * Report metric to monitoring service
   */
  private reportMetric(name: string, value: number): void {
    logger.debug('Web Vitals metric recorded', { name, value });
    
    // Report to monitoring service
    monitoringService.recordMetric(`web_vitals.${name.toLowerCase()}`, value, {
      metric_type: 'web_vitals',
      page_url: window.location.pathname
    });
    
    // Send to analytics if configured
    this.sendToAnalytics(name, value);
  }

  /**
   * Send metrics to analytics service
   */
  private sendToAnalytics(name: string, value: number): void {
    // This would integrate with your analytics service
    // For example, Google Analytics, Mixpanel, etc.
    
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', name, {
        event_category: 'Web Vitals',
        value: Math.round(value),
        non_interaction: true
      });
    }
  }

  /**
   * Mark user timing
   */
  markTiming(name: string): void {
    if (typeof window !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  }

  /**
   * Measure user timing
   */
  measureTiming(name: string, startMark: string, endMark?: string): void {
    if (typeof window !== 'undefined' && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        
        const entries = performance.getEntriesByName(name, 'measure');
        if (entries.length > 0) {
          const duration = entries[entries.length - 1].duration;
          
          logger.debug('User timing measured', { name, duration });
          
          monitoringService.recordMetric('user_timing', duration, {
            timing_name: name,
            page_url: window.location.pathname
          });
        }
      } catch (error) {
        logger.warn('Failed to measure timing', { name, error });
      }
    }
  }

  /**
   * Get current Web Vitals metrics
   */
  getWebVitalsMetrics(): Partial<WebVitalsMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): Partial<PerformanceMetrics> {
    return { ...this.performanceMetrics };
  }

  /**
   * Get performance score based on Web Vitals
   */
  getPerformanceScore(): number {
    const scores: number[] = [];
    
    // CLS score (0-100, lower is better)
    if (this.metrics.CLS !== undefined) {
      if (this.metrics.CLS <= 0.1) scores.push(100);
      else if (this.metrics.CLS <= 0.25) scores.push(75);
      else scores.push(50);
    }
    
    // FID score (0-100, lower is better)
    if (this.metrics.FID !== undefined) {
      if (this.metrics.FID <= 100) scores.push(100);
      else if (this.metrics.FID <= 300) scores.push(75);
      else scores.push(50);
    }
    
    // FCP score (0-100, lower is better)
    if (this.metrics.FCP !== undefined) {
      if (this.metrics.FCP <= 1800) scores.push(100);
      else if (this.metrics.FCP <= 3000) scores.push(75);
      else scores.push(50);
    }
    
    // LCP score (0-100, lower is better)
    if (this.metrics.LCP !== undefined) {
      if (this.metrics.LCP <= 2500) scores.push(100);
      else if (this.metrics.LCP <= 4000) scores.push(75);
      else scores.push(50);
    }
    
    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  }

  /**
   * Cleanup observers
   */
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

export const webVitalsService = new WebVitalsService();
