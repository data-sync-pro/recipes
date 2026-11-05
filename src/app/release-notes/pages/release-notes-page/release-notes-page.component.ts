import { ChangeDetectionStrategy, Component, Injector, afterNextRender } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { SeoService } from '../../../shared/services/seo.service';
import { Release, ReleasePageView } from '../../models/release.model';
import { RELEASE_NOTES_PATH, releaseNotesPagePath } from '../../release-notes.config';
import { ReleaseNotesFacade } from '../../services/release-notes-facade.service';

const PAGE_TITLE = 'Release Notes';
const PAGE_DESCRIPTION = 'Release notes for Data Sync Pro: what changed in each version.';
const EMPTY_VIEW: ReleasePageView = { releases: [], newerPage: null, olderPage: null };

/**
 * The page number from the URL: no `page` param means page 1. Anything that
 * is not a positive whole number becomes 0, which no page matches, so the
 * empty state is shown.
 */
function toPageNumber(param: string | null): number {
  if (param === null) return 1;
  const page = Number(param);
  return Number.isInteger(page) && page >= 1 ? page : 0;
}

/**
 * The feature's only container: turns the URL into a page of releases and
 * hands it to the presentational components. The URL is the state.
 */
@Component({
  selector: 'app-release-notes-page',
  templateUrl: './release-notes-page.component.html',
  styleUrls: ['./release-notes-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseNotesPageComponent {
  /** Shown in the top bar. The <h1> spells the same words out to style them. */
  readonly title = PAGE_TITLE;
  readonly latestPath = RELEASE_NOTES_PATH;

  readonly view$: Observable<ReleasePageView> = this.route.paramMap.pipe(
    map(params => toPageNumber(params.get('page'))),
    tap(page => this.onPageEnter(page)),
    switchMap(page =>
      // A failed load shows the empty state instead of leaving a blank page.
      this.facade.page$(page).pipe(catchError(() => of(EMPTY_VIEW)))
    ),
    tap(() => this.scrollToFragmentAfterRender())
  );

  constructor(
    private route: ActivatedRoute,
    private facade: ReleaseNotesFacade,
    private seo: SeoService,
    private scroller: ViewportScroller,
    private injector: Injector
  ) {}

  trackByVersion(_index: number, release: Release): string {
    return release.version;
  }

  private onPageEnter(page: number): void {
    this.seo.setPage({
      title: page > 1 ? `${PAGE_TITLE} - Page ${page}` : PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      path: releaseNotesPagePath(page),
    });

    // The app router does not manage scrolling (scrollPositionRestoration and
    // anchorScrolling are both 'disabled'), so this page does it for itself:
    // start at the top, unless the URL points at a release's #anchor.
    if (!this.route.snapshot.fragment) {
      this.scroller.scrollToPosition([0, 0]);
    }
  }

  // Releases arrive asynchronously, so a #v3-604 link can only be honoured
  // once they are in the DOM.
  private scrollToFragmentAfterRender(): void {
    const fragment = this.route.snapshot.fragment;
    if (!fragment) return;
    afterNextRender(() => this.scroller.scrollToAnchor(fragment), { injector: this.injector });
  }
}
