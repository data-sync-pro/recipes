import { Component, OnInit, SecurityContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DocsService, DocData, ExampleItem, DocImage } from '../../services/docs.service';
import { SidebarService } from '../../services/sidebar.service';
import { categoryNameFromSlug, categorySlug } from '../../utils/route.util';
import hljs from 'highlight.js';

import { map, switchMap } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface ProcessedExample {
  code?: SafeHtml;
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
  
  showImageViewer = false;
  selectedImageUrl = '';
  selectedImageAlt = '';
  private currentDocName: string | null = null; 
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private docsService: DocsService,
    private sidebarService: SidebarService,
    private sanitizer: DomSanitizer
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
          this.currentDocName = docName;

          if (categorySegment) {
            const display = categoryNameFromSlug(categorySegment);
            if (display) this.sidebarService.setActiveCategory(display);
          }

          if (!docName) {
            return [];
          }
          if (docName === 'global_variables') {
            return this.docsService.getGlobalVariables();
          }
          return this.docsService.getDocByName(docName);
        })
      )
      .subscribe((doc) => {
        if (!doc && this.currentDocName && this.currentDocName !== 'global_variables') {
          this.router.navigateByUrl('/transformation/home', { replaceUrl: true });
          return;
        }

        this.docContent = doc;

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
          code: this.highlightExamples(example)
        };
      } else {
        return {
          code: example.code ? this.highlightExamples(example.code) : undefined,
          description: example.description,
          images: example.images
        };
      }
    });
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
