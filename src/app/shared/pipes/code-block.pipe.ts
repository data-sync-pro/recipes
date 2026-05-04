import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'codeBlock'
})
export class CodeBlockPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  /**
   * Transform markdown-style code syntax to HTML code blocks
   * Supports:
   * - Inline code: `code` → <code>code</code>
   * - Code blocks: ```code``` → <pre><code>code</code></pre>
   *
   * @param value - The content to process
   * @param returnSafeHtml - Whether to return SafeHtml (true) or string (false)
   * @returns Processed content with code blocks rendered
   */
  transform(value: string | null | undefined, returnSafeHtml = true): SafeHtml | string {
    if (!value) {
      return returnSafeHtml ? this.sanitizer.bypassSecurityTrustHtml('') : '';
    }

    let content = value;

    // Process code blocks first (``` ... ```)
    // Supports optional language identifier: ```json, ```javascript, etc.
    content = content.replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) => {
        const trimmedCode = this.escapeHtml(code.trim());
        const langLabel = lang ? lang.toUpperCase() : '';

        // Build header only if there's a language label
        const headerHtml = langLabel
          ? `<div class="code-block-header"><span class="code-block-lang">${langLabel}</span></div>`
          : '';

        return `<div class="code-block-container${langLabel ? '' : ' no-header'}">${headerHtml}<pre class="code-block"><code>${trimmedCode}</code></pre></div>`;
      }
    );

    // Process inline code (` ... `)
    // Avoid matching already processed <code> tags
    content = content.replace(
      /`([^`\n]+)`/g,
      (_, code) => `<code class="inline-code">${this.escapeHtml(code)}</code>`
    );

    return returnSafeHtml
      ? this.sanitizer.bypassSecurityTrustHtml(content)
      : content;
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }
}
