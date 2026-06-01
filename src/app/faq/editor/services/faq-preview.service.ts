import { Injectable } from '@angular/core';
import { FAQExportService } from './faq-export.service';

export interface PreviewData {
  faqId: string;
  question: string;
  category: string;
  subCategory?: string;
  htmlContent: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class FAQPreviewService {
  private readonly PREVIEW_KEY_PREFIX = 'faq-preview-';
  
  constructor(
    private exportService: FAQExportService
  ) {}

  /**
   * Save preview data to session storage
   */
  savePreviewData(data: PreviewData): void {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${data.faqId}`;
    
    // Clean and process HTML content using export service logic
    const cleanedContent = this.exportService.cleanHTMLContent(data.htmlContent);
    const decodedContent = this.exportService.decodeHTMLEntities(cleanedContent);
    
    // Update the data with processed content
    const processedData: PreviewData = {
      ...data,
      htmlContent: decodedContent,
      timestamp: Date.now()
    };
    
    // Save to session storage
    sessionStorage.setItem(storageKey, JSON.stringify(processedData));
  }

  /**
   * Get preview data from session storage
   */
  getPreviewData(faqId: string): PreviewData | null {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${faqId}`;
    const storedData = sessionStorage.getItem(storageKey);
    
    if (!storedData) {
      return null;
    }
    
    try {
      return JSON.parse(storedData) as PreviewData;
    } catch (error) {
      console.error('Error parsing preview data:', error);
      return null;
    }
  }

  /**
   * Clear preview data for a specific FAQ
   */
  clearPreviewData(faqId: string): void {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${faqId}`;
    sessionStorage.removeItem(storageKey);
  }

  /**
   * Clear all preview data
   */
  clearAllPreviewData(): void {
    const keysToRemove: string[] = [];
    
    // Find all preview keys
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.PREVIEW_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove them
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  /**
   * Open preview in new tab using existing FAQ page
   */
  openPreviewInNewTab(faqId: string, data: PreviewData): { success: boolean; window?: Window; url?: string } {
    // Save the preview data first
    this.savePreviewData(data);
    
    // Create preview URL
    const url = `/faq?preview=true&faqId=${faqId}`;
    
    try {
      // Try to open with minimal parameters to avoid popup blocking
      const previewWindow = window.open(url, `faq_preview_${faqId.replace(/[^a-zA-Z0-9]/g, '_')}`);
      
      if (previewWindow) {
        // Success - window opened
        return { success: true, window: previewWindow };
      } else {
        // Popup blocked - return URL for fallback
        return { success: false, url };
      }
    } catch (error) {
      console.error('Error opening preview window:', error);
      return { success: false, url };
    }
  }

  /**
   * Update preview data and notify open preview windows
   */
  updatePreviewData(data: PreviewData): void {
    const storageKey = `${this.PREVIEW_KEY_PREFIX}${data.faqId}`;
    const dataString = JSON.stringify(data);
    

    // Method 1: Direct sessionStorage update (triggers real storage events)
    // First remove the key, then set it to ensure the storage event fires
    sessionStorage.removeItem(storageKey);
    sessionStorage.setItem(storageKey, dataString);

    // Method 2: Also try localStorage as backup (some browsers handle this better for cross-tab)
    const backupKey = `backup-${storageKey}`;
    localStorage.removeItem(backupKey);
    localStorage.setItem(backupKey, dataString);
 
  }

  /**
   * Check if preview tab is open
   */
  isPreviewTabOpen(faqId: string): boolean {
    // Try to get reference to the preview window
    const windowName = `faq-preview-${faqId}`;
    const previewWindow = window.open('', windowName, 'noopener,noreferrer');
    
    if (previewWindow && !previewWindow.closed && previewWindow.location.href) {
      // Window exists and is not closed
      previewWindow.close(); // Close the test window
      return true;
    }
    
    return false;
  }

  /**
   * Process HTML content for preview (ensures consistency with export)
   */
  processHtmlContentForPreview(htmlContent: string): string {
    // Use the same cleaning logic as export
    const cleanedContent = this.exportService.cleanHTMLContent(htmlContent);
    const decodedContent = this.exportService.decodeHTMLEntities(cleanedContent);
    
    return decodedContent;
  }
}