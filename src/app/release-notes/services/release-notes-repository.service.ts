import { Observable } from 'rxjs';
import { ReleasePage } from '../models/release.model';

/**
 * Where release notes come from. The rest of the feature depends on this
 * abstraction only; ReleaseNotesModule binds it to an implementation.
 */
export abstract class ReleaseNotesRepository {
  /**
   * One page of releases, newest first. `page` is 1-based. A page outside
   * 1..totalPages yields an empty `releases` list rather than an error.
   */
  abstract getPage(page: number, pageSize: number): Observable<ReleasePage>;
}
