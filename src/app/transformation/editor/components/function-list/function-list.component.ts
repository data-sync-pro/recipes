import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { EditorStateService } from '../../services/editor-state.service';

interface TagItem {
  'Item Name': string;
  Tags: string[];
}

interface FunctionEntry {
  name: string;
  display: string;
  primaryTag: string;
}

/** Top-level JSON files (not function folders) that the editor also exposes. */
const SPECIALS: FunctionEntry[] = [
  { name: 'global_variables', display: 'Global Variables', primaryTag: 'special' },
  { name: 'elements_of_formula', display: 'Elements of Formula', primaryTag: 'special' },
];

const SPECIAL_NAME_SET = new Set(SPECIALS.map((s) => s.name));

@Component({
  selector: 'app-function-list',
  templateUrl: './function-list.component.html',
  styleUrls: ['./function-list.component.css'],
})
export class FunctionListComponent implements OnInit, OnDestroy {
  functions: FunctionEntry[] = [];
  filtered: FunctionEntry[] = [];
  specials: FunctionEntry[] = SPECIALS;
  filterText = '';
  selected: string | null = null;
  dirty: Set<string> = new Set();
  pending: Set<string> = new Set();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private editorState: EditorStateService
  ) {}

  ngOnInit(): void {
    forkJoin({
      index: this.http.get<string[]>('assets/transformation/formulas/_index.json'),
      tags: this.http.get<TagItem[]>('assets/transformation/formulas/tags.json'),
    }).subscribe(({ index, tags }) => {
      // Build display-name + primary-tag lookups from tags.json. Functions on
      // disk that aren't in tags.json fall back to an upper-cased slug name
      // and an empty primary tag — they still appear, marked as untagged.
      const tagsByName = new Map<string, string[]>();
      const displayByName = new Map<string, string>();
      for (const t of tags) {
        const slug = t['Item Name'].toLowerCase().replace(/\s+/g, '_');
        tagsByName.set(slug, t.Tags ?? []);
        displayByName.set(slug, t['Item Name']);
      }
      this.functions = index
        .filter((name) => !SPECIAL_NAME_SET.has(name))
        .map((name) => ({
          name,
          display: displayByName.get(name) ?? name.toUpperCase(),
          primaryTag: tagsByName.get(name)?.[0] ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.applyFilter();
    });

    this.editorState.selectedDocName$
      .pipe(takeUntil(this.destroy$))
      .subscribe((name) => {
        this.selected = name;
      });

    this.editorState.dirty$
      .pipe(takeUntil(this.destroy$))
      .subscribe((dirty) => {
        this.dirty = dirty;
      });

    this.editorState.pending$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pending) => {
        this.pending = pending;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilterChange(): void {
    this.applyFilter();
  }

  select(fn: FunctionEntry): void {
    this.editorState.select(fn.name);
  }

  isDirty(fn: FunctionEntry): boolean {
    return this.dirty.has(fn.name);
  }

  isPending(fn: FunctionEntry): boolean {
    return this.pending.has(fn.name);
  }

  isSaved(fn: FunctionEntry): boolean {
    return this.dirty.has(fn.name) && !this.pending.has(fn.name);
  }

  private applyFilter(): void {
    const q = this.filterText.trim().toLowerCase();
    if (!q) {
      this.filtered = this.functions;
      return;
    }
    this.filtered = this.functions.filter(
      (f) => f.name.includes(q) || f.display.toLowerCase().includes(q)
    );
  }
}
