import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

import { Release, ReleaseContent, ReleaseIndex, ReleaseMeta, ReleasePage } from '../models/release.model';
import { releaseSlug } from '../utils/release-format.util';
import { ReleaseNotesRepository } from './release-notes-repository.service';

// The only place that knows where release content lives. Keep in sync with
// scripts/gen-prerender-routes.mjs, which reads the same index.
const RELEASE_NOTES_ASSETS = 'assets/release-notes';
const INDEX_URL = `${RELEASE_NOTES_ASSETS}/index.json`;
const releaseUrl = (version: string) => `${RELEASE_NOTES_ASSETS}/releases/${releaseSlug(version)}.json`;

/** Reads the release catalog and the per-release files from src/assets. */
@Injectable()
export class HttpReleaseNotesRepository extends ReleaseNotesRepository {
  // Fetched once per visit to the section, newest release first. 'YYYY-MM-DD'
  // dates order correctly as plain strings.
  private readonly index$: Observable<ReleaseMeta[]> = this.http.get<ReleaseIndex>(INDEX_URL).pipe(
    map(index => [...index.releases].sort((a, b) => b.date.localeCompare(a.date))),
    shareReplay(1)
  );

  constructor(private http: HttpClient) {
    super();
  }

  getPage(page: number, pageSize: number): Observable<ReleasePage> {
    return this.index$.pipe(
      switchMap(index => {
        const totalPages = Math.ceil(index.length / pageSize);
        const inRange = Number.isInteger(page) && page >= 1 && page <= totalPages;
        const metas = inRange ? index.slice((page - 1) * pageSize, page * pageSize) : [];
        // forkJoin([]) completes without emitting, so the empty page is explicit.
        const releases$ = metas.length ? forkJoin(metas.map(meta => this.loadRelease(meta))) : of([]);
        return releases$.pipe(map(releases => ({ releases, page, totalPages })));
      })
    );
  }

  // Only the releases on the requested page are downloaded.
  private loadRelease(meta: ReleaseMeta): Observable<Release> {
    return this.http.get<ReleaseContent>(releaseUrl(meta.version)).pipe(
      map(content => ({ ...meta, ...content }))
    );
  }
}
