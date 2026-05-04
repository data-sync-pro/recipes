import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { getFAQUrlByKey } from '../config/faq-urls.config';

interface AutoLinkTerm {
  faqLink?: string;
  functionDoc?: string;
  globalVariableDoc?: string;
  caseSensitive?: boolean;
  description?: string;
}

interface AutoLinkTermsConfig {
  terms: { [key: string]: AutoLinkTerm };
}

@Injectable({
  providedIn: 'root'
})
export class AutoLinkService {
  private readonly AUTO_LINK_TERMS_URL = 'assets/data/auto-link-terms.json';
  private readonly FUNCTION_DOC_BASE_URL = 'https://transformation.pushtopic.com/#/docs/';
  private autoLinkTerms: { [key: string]: AutoLinkTerm } = {};
  private autoLinkTermsLoaded = false;
  private loadingTerms$ = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {
    this.loadAutoLinkTerms();
  }

  /**
   * Load auto-link terms configuration
   */
  private loadAutoLinkTerms(): void {
    if (this.autoLinkTermsLoaded || this.loadingTerms$.value) {
      return;
    }

    this.loadingTerms$.next(true);
    
    this.http.get<AutoLinkTermsConfig>(this.AUTO_LINK_TERMS_URL)
      .pipe(
        tap(data => {
          if (data && data.terms) {
            this.autoLinkTerms = data.terms;
            this.autoLinkTermsLoaded = true;

          }
        }),
        catchError(error => {
          console.error('❌ Failed to load auto-link terms:', error);
          return of({ terms: {} });
        })
      )
      .subscribe(() => {
        this.loadingTerms$.next(false);
      });
  }

  /**
   * Apply auto-link terms to HTML content string
   */
  public applyAutoLinkTerms(content: string): string {
    if (!this.autoLinkTermsLoaded || Object.keys(this.autoLinkTerms).length === 0) {
      return content;
    }
    
    // Sort terms by length (longest first) to avoid conflicts
    const sortedTerms = Object.keys(this.autoLinkTerms).sort((a, b) => b.length - a.length);
    
    let processedContent = content;
    
    sortedTerms.forEach(term => {
      const termConfig = this.autoLinkTerms[term];
      const resolvedUrl = this.resolveTermUrl(termConfig);
      
      if (!resolvedUrl) {
        console.warn(`❌ No URL found for term: ${term}`);
        return;
      }

      // Create regex pattern for the term - only match if every first letter is uppercase and exact match
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Check if term has proper capitalization
      let isProperlyCapitalized = false;
      
      if (term.startsWith('$')) {
        // Special handling for global variables starting with $
        // They should follow patterns like: $VARIABLE_NAME, $User.PropertyName, $JOINER, $CONTEXT_RECORD_ID, $Joiner.FieldName
        const globalVarPattern = /^\$([A-Z_][A-Z0-9_]*|[A-Z][a-zA-Z0-9_]*(\.[A-Z][a-zA-Z0-9_]*)*)$/;
        isProperlyCapitalized = globalVarPattern.test(term);
      } else {
        // Original logic for non-global variables (each word starts with uppercase)
        const words = term.split(/\s+/);
        isProperlyCapitalized = words.every(word => 
          word.length > 0 && word[0] === word[0].toUpperCase()
        );
      }
      
      if (!isProperlyCapitalized) {
        console.warn(`❌ Skipping term "${term}" - not properly capitalized`);
        return; // Skip terms that don't have proper capitalization
      }
      
      // Helper function to process a tag type (strong, b, or code)
      const processTag = (tagName: string) => {
        // For outer tags (strong, b), also match content that may contain inner tags
        const innerContent = tagName === 'code' 
          ? `([^<]*?)(${escapedTerm})([^<]*?)` 
          : `((?:[^<]|<(?!/${tagName}>))*?)(${escapedTerm})((?:[^<]|<(?!/${tagName}>))*?)`;
        const pattern = new RegExp(`<${tagName}>${innerContent}</${tagName}>`, 'g');
        
        processedContent = processedContent.replace(pattern, (fullMatch, beforeTerm, capturedTerm, afterTerm, offset) => {
          // Check if the captured term exactly matches the expected term (case-sensitive)
          if (capturedTerm !== term) {
            return fullMatch; // Return unchanged if not exact match
          }
          
          // For outer tags (strong, b), check if the content already contains a link
          if (tagName !== 'code') {
            const fullContent = beforeTerm + capturedTerm + afterTerm;
            // If the content already contains an anchor tag with this term, skip processing
            if (fullContent.includes(`<a `) && fullContent.includes(`>${term}`)) {
              return fullMatch; // Already processed by inner tag
            }
          }
          
          // Skip <code> tags that are inside <pre> tags
          if (tagName === 'code') {
            const beforeMatch = processedContent.substring(0, offset);
            const afterMatch = processedContent.substring(offset + fullMatch.length);
            
            // Count unclosed <pre> tags before this match
            const preOpenCount = (beforeMatch.match(/<pre[^>]*>/g) || []).length;
            const preCloseCount = (beforeMatch.match(/<\/pre>/g) || []).length;
            
            // If there are unclosed <pre> tags, we're inside a <pre> block
            if (preOpenCount > preCloseCount) {
              return fullMatch; // Skip auto-linking inside <pre><code> blocks
            }
          }
          
          // Special handling for <code> tags with function documentation or global variables
          if (tagName === 'code' && (termConfig.functionDoc || termConfig.globalVariableDoc)) {
            // For function docs in code tags, allow function syntax after the term
            const tagContent = beforeTerm + capturedTerm + afterTerm;
            
            // Check if the term is at the beginning and followed by function syntax or global variable syntax
            const functionSyntaxPattern = termConfig.globalVariableDoc 
              ? /^\s*(\$([A-Z_][A-Z0-9_]*|[A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)*))(\s*\(.*?\)|\s*\.|\s*\)|\s*\(|$)?/
              : /^\s*([A-Z_][A-Z0-9_]*)(\s*\(.*?\)|\s*\.|\s*\)|\s*\(|$)/;
            const match = tagContent.match(functionSyntaxPattern);
            
            if (match && match[1] === term) {
              // Term is followed by function syntax - create the link
              const lightningIcon = `<span style="margin-left: -3px; vertical-align: text-top; opacity: 0.7;">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                  <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z"/>
                </svg>
              </span>`;
              let linkData = '';
              if (termConfig.functionDoc) {
                linkData = `data-function-link="${termConfig.functionDoc}"`;
              } else if (termConfig.globalVariableDoc) {
                linkData = `data-global-variable-link="${termConfig.globalVariableDoc}"`;
              }
              
              // Check if there are parentheses in the syntax - include them in the link
              const syntax = match[2];
              const hasParentheses = syntax.includes('(') && syntax.includes(')');
              
              if (hasParentheses) {
                // For function calls like "IS_FIRST_IN_ITERATION(...)", include parentheses in the link and put icon after
                const functionCallText = capturedTerm + syntax;
                const linkElement = `<a href="${resolvedUrl}" ${linkData} class="rules-engine-link" target="_blank" rel="noopener noreferrer">${functionCallText}</a>${lightningIcon}`;
                const linkedContent = beforeTerm + linkElement;
                const replacement = `<${tagName}>${linkedContent}</${tagName}>`;
                return replacement;
              } else {
                // For other cases (like ending with . or just function/variable name), put icon after term
                const linkElement = `<a href="${resolvedUrl}" ${linkData} class="rules-engine-link" target="_blank" rel="noopener noreferrer">${capturedTerm}${lightningIcon}</a>`;
                const linkedContent = beforeTerm + linkElement + afterTerm;
                const replacement = `<${tagName}>${linkedContent}</${tagName}>`;
                return replacement;
              }
            }
            
            // If no function syntax match, fall through to exact match check
          }
          
          // Standard behavior: Check if this is the complete content of the tag (no extra text)
          const tagContent = beforeTerm + capturedTerm + afterTerm;
          if (tagContent !== term) {
            return fullMatch; // Return unchanged if tag contains more than just the term
          }
          
          // Replace the entire <tag>term</tag> with <tag><a>term</a></tag>
          // Using Lightning new_window utility icon with larger size
          const lightningIcon = `<span style="margin-left: -3px; vertical-align: text-top; opacity: 0.7;">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
              <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z"/>
            </svg>
          </span>`;
          let linkData = '';
          if (termConfig.functionDoc) {
            linkData = `data-function-link="${termConfig.functionDoc}"`;
          } else if (termConfig.globalVariableDoc) {
            linkData = `data-global-variable-link="${termConfig.globalVariableDoc}"`;
          } else {
            linkData = `data-faq-link="${termConfig.faqLink}"`;
          }
          const linkElement = `<a href="${resolvedUrl}" ${linkData} class="rules-engine-link" target="_blank" rel="noopener noreferrer">${capturedTerm}${lightningIcon}</a>`;
          const replacement = `<${tagName}>${linkElement}</${tagName}>`;
          return replacement;
        });
      };
      
      // Determine supported tags based on link type
      // Process code tags first (innermost), then strong/b tags (outer)
      const supportedTags = (termConfig.functionDoc || termConfig.globalVariableDoc)
        ? ['code', 'strong', 'b']  // Function docs and global variables support three tags - code first
        : ['strong', 'b'];         // FAQ links support two tags
      
      // Process all supported tags
      supportedTags.forEach(tagName => {
        processTag(tagName);
      });
    });
    
    return processedContent;
  }

  /**
   * Resolve URL for a term configuration
   */
  private resolveTermUrl(termConfig: AutoLinkTerm): string {
    // Function documentation link
    if (termConfig.functionDoc) {
      // Convert function name to lowercase for URL
      return this.FUNCTION_DOC_BASE_URL + termConfig.functionDoc.toLowerCase();
    }
    
    // Global variable documentation link
    if (termConfig.globalVariableDoc) {
      return this.FUNCTION_DOC_BASE_URL + termConfig.globalVariableDoc.toLowerCase();
    }
    
    // FAQ link
    if (termConfig.faqLink) {
      return getFAQUrlByKey(termConfig.faqLink);
    }
    
    return '';
  }

  /**
   * Apply auto-link terms to SafeHtml content
   */
  public applyAutoLinkTermsToSafeHtml(content: SafeHtml): SafeHtml {
    // Convert SafeHtml to string
    const htmlString = this.sanitizer.sanitize(1, content) || '';
    
    // Apply auto-link terms
    const processedContent = this.applyAutoLinkTerms(htmlString);
    
    // Return as SafeHtml
    return this.sanitizer.bypassSecurityTrustHtml(processedContent);
  }

  /**
   * Check if auto-link terms are loaded
   */
  public isLoaded(): boolean {
    return this.autoLinkTermsLoaded;
  }

  /**
   * Get loading state observable
   */
  public getLoadingState(): Observable<boolean> {
    return this.loadingTerms$.asObservable();
  }

  /**
   * Force reload auto-link terms
   */
  public reloadTerms(): void {
    this.autoLinkTermsLoaded = false;
    this.loadAutoLinkTerms();
  }

  /**
   * Get all configured auto-link terms
   */
  public getTerms(): { [key: string]: AutoLinkTerm } {
    return { ...this.autoLinkTerms };
  }
}