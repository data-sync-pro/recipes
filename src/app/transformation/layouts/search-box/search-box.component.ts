import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.component.html',
  styleUrls: ['./search-box.component.css']
})
export class SearchBoxComponent {
  @Output() searchClick = new EventEmitter<void>();

  onSearchClick(): void {
    this.searchClick.emit();
  }
}
