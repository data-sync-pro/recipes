import { Component, Input } from '@angular/core';

export type CalloutType = 'info' | 'warning' | 'tip' | 'note';

@Component({
  selector: 'app-callout',
  templateUrl: './callout.component.html',
  styleUrls: ['./callout.component.css']
})
export class CalloutComponent {
  @Input() type: CalloutType = 'info';
  @Input() title?: string;
  @Input() content: string = '';

  private readonly defaultTitles: Record<CalloutType, string> = {
    info: 'Info',
    warning: 'Warning',
    tip: 'Tip',
    note: 'Note'
  };

  get displayTitle(): string {
    return this.title || this.defaultTitles[this.type];
  }
}
