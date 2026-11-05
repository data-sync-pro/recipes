import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ReleasePageView } from '../models/release.model';
import { RELEASES_PER_PAGE } from '../release-notes.config';
import { ReleaseNotesRepository } from './release-notes-repository.service';

/**
 * Paging rules for the release notes page. Holds no state of its own: the URL
 * decides which page is shown, so every call is derived from the page number.
 */
@Injectable()
export class ReleaseNotesFacade {
  constructor(private repository: ReleaseNotesRepository) {}

  page$(page: number): Observable<ReleasePageView> {
    return this.repository.getPage(page, RELEASES_PER_PAGE).pipe(
      map(({ releases, totalPages }) => {
        // An out-of-range page has no releases and therefore no neighbours;
        // the page shows its empty state with a link back to the first page.
        const hasReleases = releases.length > 0;
        return {
          releases,
          newerPage: hasReleases && page > 1 ? page - 1 : null,
          olderPage: hasReleases && page < totalPages ? page + 1 : null,
        };
      })
    );
  }
}
