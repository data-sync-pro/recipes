import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { releaseNotesPagePath } from '../../release-notes.config';

/** "Newer updates" / "Older updates" links between pages of releases. */
@Component({
  selector: 'app-release-pager',
  templateUrl: './release-pager.component.html',
  styleUrls: ['./release-pager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleasePagerComponent {
  newerLink: string | null = null;
  olderLink: string | null = null;

  /** Page number the "Newer updates" link goes to, or null to hide it. */
  @Input() set newerPage(page: number | null) {
    this.newerLink = page === null ? null : releaseNotesPagePath(page);
  }

  /** Page number the "Older updates" link goes to, or null to hide it. */
  @Input() set olderPage(page: number | null) {
    this.olderLink = page === null ? null : releaseNotesPagePath(page);
  }
}
