import { Observable, of } from 'rxjs';

import { Release, ReleasePage, ReleasePageView } from '../models/release.model';
import { RELEASES_PER_PAGE } from '../release-notes.config';
import { ReleaseNotesFacade } from './release-notes-facade.service';
import { ReleaseNotesRepository } from './release-notes-repository.service';

const RELEASE: Release = { version: '1.0', date: '2026-01-10', sections: [] };

/** A repository with `totalPages` pages; pages outside that range are empty. */
class FakeRepository extends ReleaseNotesRepository {
  requestedPageSize: number | undefined;

  constructor(private totalPages: number) {
    super();
  }

  getPage(page: number, pageSize: number): Observable<ReleasePage> {
    this.requestedPageSize = pageSize;
    const inRange = page >= 1 && page <= this.totalPages;
    return of({ releases: inRange ? [RELEASE] : [], page, totalPages: this.totalPages });
  }
}

describe('ReleaseNotesFacade', () => {
  function view(page: number, totalPages: number): ReleasePageView {
    let result: ReleasePageView | undefined;
    new ReleaseNotesFacade(new FakeRepository(totalPages)).page$(page).subscribe(value => (result = value));
    if (!result) throw new Error('page$() did not emit');
    return result;
  }

  it('offers only an older page on the first page', () => {
    expect(view(1, 3)).toEqual({ releases: [RELEASE], newerPage: null, olderPage: 2 });
  });

  it('offers both neighbours on a middle page', () => {
    expect(view(2, 3)).toEqual({ releases: [RELEASE], newerPage: 1, olderPage: 3 });
  });

  it('offers only a newer page on the last page', () => {
    expect(view(3, 3)).toEqual({ releases: [RELEASE], newerPage: 2, olderPage: null });
  });

  it('offers no neighbours when everything fits on one page', () => {
    expect(view(1, 1)).toEqual({ releases: [RELEASE], newerPage: null, olderPage: null });
  });

  it('offers no neighbours for an out-of-range page', () => {
    expect(view(99, 3)).toEqual({ releases: [], newerPage: null, olderPage: null });
  });

  it('asks the repository for RELEASES_PER_PAGE releases', () => {
    const repository = new FakeRepository(1);
    new ReleaseNotesFacade(repository).page$(1).subscribe();
    expect(repository.requestedPageSize).toBe(RELEASES_PER_PAGE);
  });
});
