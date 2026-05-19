import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Input() collapsed$!: Observable<boolean>;
  @Input() showSidebar = false;
  
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() searchOpen = new EventEmitter<void>();

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onSearchOpen(): void {
    this.searchOpen.emit();
  }
}
