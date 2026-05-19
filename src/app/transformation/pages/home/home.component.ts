import { AfterViewChecked, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DocsService, DocData } from '../../services/docs.service';
import { categorySlug } from '../../utils/route.util';
interface FunctionTag {
  "Item Name": string;
  Tags: string[];
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewChecked {
  tagsData: FunctionTag[] = [];
  itemsByTag: { [tag: string]: string[] } = {};
  uniqueTags: string[] = [];
  displayTags: string[] = [];
  functionDescriptions: { [funcName: string]: string } = {};
  formulaElements: any = null;


  globalVariables: { variable: string; description: string; }[] | undefined
  operators: { [category: string]: { operator: string; name: string; description: string }[] } | null = null;

  // The scroll container is <main class="content">, not the window, so
  // Angular's built-in anchorScrolling (which calls window.scrollTo) is a
  // no-op here. We also can't scroll on NavigationEnd because the target
  // sections are populated asynchronously from HTTP loads. Defer the scroll
  // until the matching element actually appears in the DOM.
  private pendingFragment: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private docsService: DocsService
  ) {}

  async ngOnInit(): Promise<void> {
    // Canonical in-page section URL is /home/<section>. paramMap emits the
    // section slug for both cold loads and in-page navigation between sections.
    // Malformed sections (e.g. a percent-encoded legacy path stuffed into the
    // section slot) fall through to /home so the user lands on the index.
    this.route.paramMap.subscribe((params) => {
      const section = params.get('section');
      if (!section) return;
      if (!/^[a-z0-9_]+$/.test(section)) {
        this.router.navigate(['/transformation/home'], { replaceUrl: true });
        return;
      }
      this.pendingFragment = section;
    });

    // Legacy /home#<section> URLs auto-upgrade to /home/<section> so shared
    // links with fragments still work without leaving '#' in the address bar.
    this.route.fragment.subscribe((fragment) => {
      if (!fragment) return;
      this.router.navigate(['/transformation/home', fragment], { replaceUrl: true });
    });

    this.loadTags();
    this.loadGlobalVariables();
    this.loadOperators();
    this.loadFormulaElements();

  }

  ngAfterViewChecked(): void {
    if (!this.pendingFragment) return;
    const el = document.getElementById(this.pendingFragment);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      this.pendingFragment = null;
    }
  }
  // Load tags.json and group functions by tag, skipping excluded tags
  loadTags() {
    const excludedTags = new Set(['Global Variables', 'Operators']);
    this.http.get<FunctionTag[]>('assets/transformation/formulas/tags.json').subscribe((data) => {
      this.tagsData = data;
      const tagSet = new Set<string>();

      data.forEach((item) => {
        item.Tags.forEach((tag) => {
          if (excludedTags.has(tag)) {
            return; // Skip tags that are excluded
          }
          tagSet.add(tag);
          if (!this.itemsByTag[tag]) {
            this.itemsByTag[tag] = [];
          }
          this.itemsByTag[tag].push(item["Item Name"]);
        });
      });

      Object.keys(this.itemsByTag).forEach(tag => {
        this.itemsByTag[tag].sort((a, b) => {
          const aDollar = a.startsWith('$');
          const bDollar = b.startsWith('$');
          if (aDollar && !bDollar) return 1;
          if (!aDollar && bDollar) return -1;
          return a.localeCompare(b);
        }
        );
        
      });

      const desiredOrder = [
        'Text',
        'Logical',
        'Number',
        'Date & Time',
        'Operators',
        'Global Variables',
        'Randomization',
        'Type Processing',
        'Trigger',
        'Advanced'
      ];

      this.displayTags = desiredOrder.filter(tag => {
        if (tag === 'Operators' || tag === 'Global Variables') {
          return true;
        }
        return tagSet.has(tag);
      });

      // Also build uniqueTags from tagSet for any other internal processing if needed
      this.uniqueTags = Array.from(tagSet); // if you need it, though displayTags is used for display

      this.loadFunctionDescriptions();
    });
  }


  // Dynamically load each function's description from its JSON file
  loadFunctionDescriptions() {
    this.tagsData.forEach(item => {
      const funcName = item["Item Name"];
      
      if (funcName.toUpperCase() === 'GLOBAL_VARIABLES') {
        return;
      }
      
      const baseName = funcName.toLowerCase().replace(/\s/g, '_');
      const filePath = `assets/transformation/formulas/${baseName}/data.json`;
      this.http.get<any>(filePath).subscribe(
        funcData => {
          if (funcName.trim().toLowerCase() === 'apex class') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(funcData.description, 'text/html');
            const firstParagraph = doc.querySelector('p');
            this.functionDescriptions[funcName] = firstParagraph && firstParagraph.textContent ? firstParagraph.textContent.trim() : 'Description not available.';
          } else {
            this.functionDescriptions[funcName] = funcData.description;
          }
        },
        error => {
          this.functionDescriptions[funcName] = 'Description not available.';
        }
      );
    });
  }

  // Load Global Variables using the same style as the docs page
  loadGlobalVariables() {
    this.docsService.getGlobalVariables().subscribe((data: DocData) => {
      this.globalVariables = data.globalVariables;
    });
  }

  // Load Operators using the same style as the docs page
  loadOperators() {
    this.http.get<any>('assets/transformation/formulas/operators/data.json').subscribe(data => {
      this.operators = data.operators;
    });
  }

    // Load Elements of a Formula from its JSON file
    loadFormulaElements() {
      this.http.get<any>('assets/transformation/formulas/elements_of_formula.json').subscribe((data) => {
        this.formulaElements = data;
      });
    }

  // Utility to get object keys for use in the template (for operators grouping)
  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  getAnchorId(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  goToFunction(funcName: string) {
    // Build a category-prefixed URL (/text/char) using the function's primary
    // category. Falls back to a flat /char URL if the category lookup fails.
    this.docsService.getPrimaryCategory(funcName).subscribe(category => {
      const routeName = funcName.toLowerCase();
      if (category) {
        this.router.navigate(['/transformation', categorySlug(category), routeName]);
      } else {
        this.router.navigate(['/transformation', routeName]);
      }
    });
  }
}