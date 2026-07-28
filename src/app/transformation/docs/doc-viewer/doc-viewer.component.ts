import { Component, OnInit, SecurityContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DocsService, DocData, ExampleItem, DocImage } from '../../services/docs.service';
import { SidebarService } from '../../services/sidebar.service';
import { categoryNameFromSlug, categorySlug } from '../../utils/route.util';
import { hljs } from 'src/app/shared/highlight';
import { ClipboardUtil } from 'src/app/recipe/core/utils/clipboard.util';
import { scrollToTopOnNavigation } from 'src/app/recipe/core/utils/scroll.util';
import { SeoService } from 'src/app/shared/services/seo.service';

import { map, switchMap } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface ProcessedExample {
  code?: SafeHtml;
  // Original, un-highlighted source used by the copy button so users copy
  // clean text instead of the syntax-highlighted markup.
  rawCode?: string;
  // True when the code block is tall enough to warrant a collapse/expand
  // toggle; short examples render fully without one.
  isLong?: boolean;
  description?: string;
  images?: DocImage[];
}

@Component({
  selector: 'app-doc-viewer',
  templateUrl: './doc-viewer.component.html',
  styleUrls: ['./doc-viewer.component.css'],
})
export class DocViewerComponent implements OnInit {
  docContent: DocData | null = null;
  processedExamples: ProcessedExample[] = [];
  highlightedDescriptionCode: SafeHtml | null = null;
  // First-load skeleton state — true while the function's JSON is being fetched.
  isLoading = true;
  
  showImageViewer = false;
  selectedImageUrl = '';
  selectedImageAlt = '';
  // Id of the example whose copy button is currently in its "Copied" state.
  copiedId: string | null = null;
  // Indices of example code blocks the user has expanded past the collapsed
  // preview height.
  expandedExamples = new Set<number>();
  private copyResetTimer: ReturnType<typeof setTimeout> | undefined;
  private currentDocName: string | null = null;

  // A code block taller than this many lines starts collapsed with a toggle.
  private static readonly LONG_EXAMPLE_LINES = 30;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private docsService: DocsService,
    private sidebarService: SidebarService,
    private sanitizer: DomSanitizer,
    private seo: SeoService
  ) {}

  ngOnInit(): void {
    // Upgrade legacy `/char?activeCategory=Text` URLs to canonical `/text/char`.
    const snapshot = this.route.snapshot;
    const legacyCategory = snapshot.queryParamMap.get('activeCategory');
    const hasCategoryParam = !!snapshot.paramMap.get('category');
    const legacyDocName = snapshot.paramMap.get('docName');
    if (legacyCategory && !hasCategoryParam && legacyDocName) {
      const slug = categorySlug(legacyCategory);
      if (slug) {
        this.router.navigate(['/transformation', slug, legacyDocName], { replaceUrl: true });
        return;
      }
    }

    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const docName = params.get('docName');
          const categorySegment = params.get('category');
          // Land at the top of the new function page. Called here — inside the
          // param subscription, not the async doc callback — because the
          // navigation trigger is only readable while the navigation is still
          // in progress (see scroll.util.ts); back/forward keeps its position.
          scrollToTopOnNavigation(this.router, docName !== this.currentDocName);
          this.currentDocName = docName;

          if (categorySegment) {
            const display = categoryNameFromSlug(categorySegment);
            if (display) this.sidebarService.setActiveCategory(display);
          }

          if (!docName) {
            this.isLoading = false;
            return [];
          }
          this.isLoading = true;
          if (docName === 'global_variables') {
            return this.docsService.getGlobalVariables();
          }
          return this.docsService.getDocByName(docName);
        })
      )
      .subscribe((doc) => {
        this.isLoading = false;

        if (!doc && this.currentDocName && this.currentDocName !== 'global_variables') {
          this.router.navigateByUrl('/transformation', { replaceUrl: true });
          return;
        }

        this.docContent = doc;
        if (doc) {
          this.seo.setPage({ title: doc.title, description: doc.description });
        }

        this.expandedExamples.clear();
        this.processedExamples = this.processExamples(doc?.examples ?? []);

        this.highlightedDescriptionCode = doc?.descriptionCode
          ? this.highlightDescriptionCode(doc.descriptionCode)
          : null;
      });

  }

  private processExamples(examples: (string | ExampleItem)[]): ProcessedExample[] {
    return examples.map(example => {
      if (typeof example === 'string') {
        return {
          code: this.highlightExamples(example),
          rawCode: this.toRawCode(example),
          isLong: this.isLongCode(example)
        };
      } else {
        return {
          code: example.code ? this.highlightExamples(example.code) : undefined,
          rawCode: example.code ? this.toRawCode(example.code) : undefined,
          isLong: example.code ? this.isLongCode(example.code) : false,
          description: example.description,
          images: example.images
        };
      }
    });
  }

  // Clean text for the clipboard: users should copy only the formula, not the
  // annotations shown alongside it. Strips the /* ... */ rendered-output block
  // and the -- / // explanatory lines, then removes the <shadow> display
  // markers (keeping the formula text they wrap, e.g. {!Name}).
  private toRawCode(raw: string): string {
    const lineComment = this.currentDocName === 'apex_class' ? '//' : '--';
    return raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(new RegExp(`[ \\t]*${lineComment}.*$`, 'gm'), '')
      .replace(/<\/?shadow>/g, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // A code block is "long" once the displayed source exceeds the line
  // threshold, at which point it renders collapsed with a Show more/less
  // toggle. Measured on the full source (comments included) since that is what
  // determines the rendered height.
  private isLongCode(displaySource: string): boolean {
    return displaySource.split('\n').length > DocViewerComponent.LONG_EXAMPLE_LINES;
  }

  toggleExpand(index: number): void {
    if (this.expandedExamples.has(index)) {
      this.expandedExamples.delete(index);
    } else {
      this.expandedExamples.add(index);
    }
  }

  async copyExample(text: string | undefined, id: string): Promise<void> {
    const ok = await ClipboardUtil.copyToClipboard(text ?? '');
    if (!ok) return;
    this.copiedId = id;
    clearTimeout(this.copyResetTimer);
    this.copyResetTimer = setTimeout(() => {
      this.copiedId = null;
    }, 1400);
  }

  private highlightExamples(raw: string): SafeHtml {
    const tmp = raw
      .replace(/<shadow>/g, '§§SHD_START§§')
      .replace(/<\/shadow>/g, '§§SHD_END§§');

    const language = this.currentDocName === 'apex_class' ? 'java' : 'sql';
    const highlighted = hljs.highlight(tmp, { language }).value;

    const cleaned = highlighted
      .replace(/§§SHD_START§§/g, '<span class="code-comment">')
      .replace(/§§SHD_END§§/g, '</span>')
      .replace(/\/\*/g, '')
      .replace(/\*\//g, '');

    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  }

  private highlightDescriptionCode(raw: string): SafeHtml {
    const language = this.currentDocName === 'apex_class' ? 'java' : 'sql';
    const highlighted = hljs.highlight(raw, { language }).value;
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
  
  getActiveCategory$(formula: string) {
    return this.docsService.getPrimaryCategory(formula);
  }

  // Returns a routerLink commands array. If the related formula has a known
  // primary category, builds the canonical /<category>/<func> path; otherwise
  // falls back to the legacy /<func> form so the link still works.
  getRelatedFormulaLink$(formula: string) {
    const docName = formula.toLowerCase();
    return this.docsService.getPrimaryCategory(formula).pipe(
      map((name) => (name ? ['/transformation', categorySlug(name), docName] : ['/transformation', docName]))
    );
  }

  openImageViewer(imageUrl: string, imageAlt?: string) {
    this.selectedImageUrl = imageUrl;
    this.selectedImageAlt = imageAlt || '';
    this.showImageViewer = true;
  }

  closeImageViewer() {
    this.showImageViewer = false;
    this.selectedImageUrl = '';
    this.selectedImageAlt = '';
  }

}
