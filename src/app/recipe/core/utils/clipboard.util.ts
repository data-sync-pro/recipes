/**
 * Clipboard utilities for copying text to clipboard
 */
export class ClipboardUtil {
  /**
   * Copy text to clipboard using modern Clipboard API with fallback
   * @param text The text to copy
   * @returns Promise<boolean> indicating success or failure
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Modern Clipboard API (requires HTTPS or localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;

        // Make the textarea invisible but accessible
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          return successful;
        } catch (err) {
          document.body.removeChild(textArea);
          console.error('Failed to copy text using fallback method:', err);
          return false;
        }
      }
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      return false;
    }
  }
}
