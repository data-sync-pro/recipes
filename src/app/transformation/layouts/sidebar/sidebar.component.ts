import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Input() collapsed$!: Observable<boolean>;
  // Mobile drawer open state (≤1024px), owned by the layout.
  @Input() mobileOpen = false;

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleMobile = new EventEmitter<void>();
  @Output() closeMobile = new EventEmitter<void>();

  // Desktop collapse/expand.
  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  // Mobile drawer open/close.
  onToggleMobile(): void {
    this.toggleMobile.emit();
  }

  onCloseMobile(): void {
    this.closeMobile.emit();
  }
}
