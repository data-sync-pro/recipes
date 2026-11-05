import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Release } from '../../models/release.model';

/** One release: its version and date, then its sections. */
@Component({
  selector: 'app-release-entry',
  templateUrl: './release-entry.component.html',
  styleUrls: ['./release-entry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseEntryComponent {
  @Input() release!: Release;
}
