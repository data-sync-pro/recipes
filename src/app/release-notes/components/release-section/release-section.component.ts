import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ReleaseSection } from '../../models/release.model';

/** A named group of items within a release, e.g. "Fixes" or "Changes". */
@Component({
  selector: 'app-release-section',
  templateUrl: './release-section.component.html',
  styleUrls: ['./release-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseSectionComponent {
  @Input() section!: ReleaseSection;
  /** Version of the release this section belongs to; prefixes item anchor ids. */
  @Input() version!: string;
}
