import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ReleaseIndex, ReleasePage } from '../models/release.model';
import { HttpReleaseNotesRepository } from './http-release-notes-repository.service';

const INDEX_URL = 'assets/release-notes/index.json';

// Deliberately not in date order, so the tests prove the repository sorts.
const INDEX: ReleaseIndex = {
  releases: [
    { version: '1.0', date: '2026-01-10' },
    { version: '1.2', date: '2026-03-05' },
    { version: '1.1', date: '2026-02-01' },
  ],
};

describe('HttpReleaseNotesRepository', () => {
  let repository: HttpReleaseNotesRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpReleaseNotesRepository, provideHttpClient(), provideHttpClientTesting()],
    });
    repository = TestBed.inject(HttpReleaseNotesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Requests a page, answers the HTTP calls, and reports what was fetched. */
  function load(page: number, pageSize: number): { result: ReleasePage; releaseUrls: string[] } {
    let result: ReleasePage | undefined;
    repository.getPage(page, pageSize).subscribe(value => (result = value));

    http.expectOne(INDEX_URL).flush(INDEX);
    const releaseRequests = http.match(request => request.url.includes('/releases/'));
    releaseRequests.forEach(request =>
      request.flush({ sections: [{ name: `from ${request.request.url}`, items: [] }] })
    );

    if (!result) throw new Error('getPage() did not emit');
    return { result, releaseUrls: releaseRequests.map(request => request.request.url) };
  }

  it('returns releases newest first', () => {
    const { result } = load(1, 5);
    expect(result.releases.map(release => release.version)).toEqual(['1.2', '1.1', '1.0']);
  });

  it('slices out the requested page', () => {
    expect(load(1, 2).result.releases.map(release => release.version)).toEqual(['1.2', '1.1']);
  });

  it('loads only the release files of the requested page', () => {
    const { result, releaseUrls } = load(2, 2);
    expect(result.releases.map(release => release.version)).toEqual(['1.0']);
    expect(releaseUrls).toEqual(['assets/release-notes/releases/v1-0.json']);
  });

  it('merges the index entry with the content of its release file', () => {
    const [release] = load(2, 2).result.releases;
    expect(release).toEqual({
      version: '1.0',
      date: '2026-01-10',
      sections: [{ name: 'from assets/release-notes/releases/v1-0.json', items: [] }],
    });
  });

  it('reports totalPages and the requested page', () => {
    expect(load(1, 2).result).toEqual(jasmine.objectContaining({ page: 1, totalPages: 2 }));
  });

  it('counts a full last page correctly', () => {
    expect(load(1, 3).result.totalPages).toBe(1);
  });

  it('returns an empty list for a page past the end, without loading any release', () => {
    const { result, releaseUrls } = load(3, 2);
    expect(result).toEqual({ releases: [], page: 3, totalPages: 2 });
    expect(releaseUrls).toEqual([]);
  });

  it('returns an empty list for page 0', () => {
    expect(load(0, 2).result.releases).toEqual([]);
  });
});
