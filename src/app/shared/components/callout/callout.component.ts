import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

// Site-wide callout (user manual style). `content` is pre-rendered, trusted HTML;
// nested blocks can be projected and render below it inside the body.
@Component({
  selector: 'app-callout',
  templateUrl: './callout.component.html',
  styleUrls: ['./callout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalloutComponent {
  @Input() variant: CalloutVariant = 'info';
  @Input() title?: string;
  @Input() content?: string;
}
