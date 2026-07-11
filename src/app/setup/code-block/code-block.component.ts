import { Component, Input, ChangeDetectionStrategy, AfterViewChecked, ElementRef, ViewChild, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Block } from '../models/setup.model';
import { hljs } from 'src/app/shared/highlight';
import { ClipboardUtil } from 'src/app/recipe/core/utils/clipboard.util';

/**
 * Code panel for setup blocks: header strip (language label + Copy button) over
 * a syntax-highlighted <pre>. Owns its own hljs highlight side-effect and
 * copied-state feedback so the recursive block renderer stays lean.
 */
@Component({
  selector: 'app-setup-code-block',
  templateUrl: './code-block.component.html',
  styleUrls: ['./code-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupCodeBlockComponent implements AfterViewChecked {
  @Input() block!: Block;
  @ViewChild('codeBlock') codeBlock?: ElementRef<HTMLElement>;

  copied = false;
  private highlighted = false;
  private copyResetTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngAfterViewChecked(): void {
    // highlight.js needs the browser DOM; skip during prerendering (the code
    // text is still emitted, just un-colorized until the client highlights it).
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.codeBlock && !this.highlighted) {
      hljs.highlightElement(this.codeBlock.nativeElement);
      this.highlighted = true;
    }
  }

  async copy(): Promise<void> {
    const ok = await ClipboardUtil.copyToClipboard(this.block.content || '');
    if (!ok) return;
    this.copied = true;
    this.cdr.markForCheck();
    clearTimeout(this.copyResetTimer);
    this.copyResetTimer = setTimeout(() => {
      this.copied = false;
      this.cdr.markForCheck();
    }, 1400);
  }

  // Map authoring language -> a highlight.js registered language. Unknown
  // languages fall through and degrade to plain text (hljs skips them).
  getHljsLanguage(language: string | undefined): string {
    const languageMap: Record<string, string> = {
      'apex': 'java',
      'soql': 'sql',
    };
    return languageMap[language || ''] || language || 'plaintext';
  }
}
