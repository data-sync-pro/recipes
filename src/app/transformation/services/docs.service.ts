import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, shareReplay } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface Parameter {
  name: string;
  type: string;
  required: string;
  description: string;
}

export interface DocImage {
  src: string;
  alt?: string;
}

export interface ExampleItem {
  code?: string;
  description?: string;
  images?: DocImage[];
}

export interface Callout {
  type: 'info' | 'warning' | 'tip' | 'note';
  title?: string;
  content: string;
}

export interface DocData {
  title: string;
  description?: string;
  images?: DocImage[];
  descriptionCode?: string;
  descriptionCallouts?: Callout[];
  syntax?: string;
  syntaxCallouts?: Callout[];
  parameters?: Parameter[];
  parametersCallouts?: Callout[];
  examples?: (string | ExampleItem)[];
  examplesCallouts?: Callout[];
  tips?: string[];
  tipsCallouts?: Callout[];
  relatedFormulas?: string[];
  operators?: {
    [category: string]: {
      operator: string;
      name: string;
      description: string;
    }[];
  };
  globalVariables?: {
    variable: string;
    description: string;
  }[];
}

interface TagItem {
  'Item Name': string;
  Tags: string[];
}

@Injectable({
  providedIn: 'root',
})
export class DocsService {
  constructor(private http: HttpClient) {}

  getDocByName(docName: string): Observable<DocData | null> {
    const baseUrl = `assets/transformation/formulas/${docName}/`;
    const url = `${baseUrl}data.json`;
    return this.http.get<DocData>(url).pipe(
      map((doc) => this.resolveImagePaths(doc, baseUrl)),
      catchError((error) => {
        console.error(`Error loading ${url}:`, error);
        return of(null);
      })
    );
  }

  /**
   * Loads a function doc without rewriting relative image paths.
   * Use this for editing — preserves the on-disk shape so exports round-trip cleanly.
   */
  getDocByNameRaw(docName: string): Observable<DocData | null> {
    const url = `assets/transformation/formulas/${docName}/data.json`;
    return this.http.get<DocData>(url).pipe(
      catchError((error) => {
        console.error(`Error loading ${url}:`, error);
        return of(null);
      })
    );
  }

  // Rewrites image src values that are relative to the function's data.json
  // into URLs the browser can load (relative to the document root).
  private resolveImagePaths(doc: DocData, baseUrl: string): DocData {
    const resolve = (img: DocImage): DocImage =>
      this.isAbsoluteSrc(img.src) ? img : { ...img, src: baseUrl + img.src };

    if (doc.images) {
      doc.images = doc.images.map(resolve);
    }
    if (doc.examples) {
      doc.examples = doc.examples.map((ex) => {
        if (typeof ex === 'string' || !ex.images) return ex;
        return { ...ex, images: ex.images.map(resolve) };
      });
    }
    return doc;
  }

  private isAbsoluteSrc(src: string): boolean {
    return /^(https?:|data:|\/|assets\/)/.test(src);
  }

  getGlobalVariables(): Observable<DocData> {
    return this.http.get<DocData>('assets/transformation/formulas/global_variables.json');
  }

  private readonly tagMap$: Observable<Map<string, string>> = this.http
    .get<TagItem[]>('assets/transformation/formulas/tags.json')
    .pipe(
      map((list) => {
        const m = new Map<string, string>();
        list.forEach((item) => {
          if (item.Tags?.length) {
            m.set(item['Item Name'].toUpperCase(), item.Tags[0]); 
          }
        });
        return m;
      }),
      shareReplay(1),
      catchError((err) => {
        console.error('Error loading tag.json', err);
        return of(new Map()); 
      })
    );
  getPrimaryCategory(formula: string): Observable<string | null> {
    return this.tagMap$.pipe(
      map((mapObj) => mapObj.get(formula.toUpperCase()) ?? null)
    );
  }
}
