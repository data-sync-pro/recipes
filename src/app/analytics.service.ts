import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  userConsented = false;
  private enabled = false; // Analytics is disabled

  constructor(private http: HttpClient) {}

  setConsent(consent: boolean) {
    this.userConsented = consent;
  }


  private getOrSetVisitorIdFromCookie(): string {
    const cookieName = 'visitorId';

    const existingCookie = this.getCookieValue(cookieName);
    if (existingCookie) {
      return existingCookie;
    }

    const newId = Math.random().toString(36).substring(2, 10);
    const daysToExpire = 365; // Customize the expiration as needed
    this.setCookie(cookieName, newId, daysToExpire);
    return newId;
  }

  private getCookieValue(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  private setCookie(name: string, value: string, days?: number) {
    let cookieString = `${name}=${encodeURIComponent(value)}; path=/;`;
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      cookieString += ` expires=${date.toUTCString()};`;
    }
    document.cookie = cookieString;
  }

  private getVisitorId(): string {
    return this.getOrSetVisitorIdFromCookie();
  }

  trackClickEvent(data: { element: string; timestamp: string }) {
    if (!this.enabled) {
      return;
    }
    if (!this.userConsented) {
      return;
    }
    const visitorId = this.getVisitorId();
    const payload = {
      visitorId,
      eventType: 'click',
      element: data.element,
      timestamp: data.timestamp
    };
    this.http.post('http://localhost:3000/api/track', payload)
      .subscribe({
        next: () => {},
        error: (err) => console.error('Tracking error:', err)
      });
  }

  trackPageView(pageUrl: string) {
    if (!this.enabled) {
            return;
    }
    if (!this.userConsented) {
      return;
    }
    const visitorId = this.getVisitorId();
    const payload = {
      visitorId,
      eventType: 'page_view',
      page: pageUrl,
      timestamp: new Date().toISOString()
    };
    this.http.post('http://localhost:3000/api/track', payload)
      .subscribe({
        next: () => {},
        error: (err) => console.error('Tracking error:', err)
      });
  }
  trackCustomEvent(data: any) {
    if (!this.enabled) {
      return;
    }
    if (!this.userConsented) {
      return;
    }
    const visitorId = this.getVisitorId();
    const payload = {
      visitorId,
      ...data
    };
    this.http.post('http://localhost:3000/api/track', payload)
      .subscribe({
        next: () => {},
        error: (err) => console.error('Tracking error:', err)
      });
  }
}
