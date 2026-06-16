import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.component.html',
  styleUrls: ['./search-box.component.scss']
})
export class SearchBoxComponent {
  /** Current filter text (owned by the parent navigation tree). */
  @Input() query = '';

  /** Emits on every keystroke so the parent can filter its list live. */
  @Output() queryChange = new EventEmitter<string>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  onInput(value: string): void {
    this.query = value;
    this.queryChange.emit(value);
  }

  clear(): void {
    this.query = '';
    this.queryChange.emit('');
    this.searchInput?.nativeElement.focus();
  }

  /** Focus (and select) the input — lets the host wire the `/` shortcut to it. */
  focus(): void {
    const el = this.searchInput?.nativeElement;
    if (el) {
      el.focus();
      el.select();
    }
  }
}
