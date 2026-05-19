import { Component, HostListener } from '@angular/core';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-function-page-main-layout',
  templateUrl: './function-page-main-layout.component.html',
  styleUrls: ['./function-page-main-layout.component.css'],
})
export class FunctionPageMainLayoutComponent {
  isSearchOpen = false;
  collapsed$ = this.layout.collapsed$;
  showSidebar = false;

  constructor(private layout: LayoutService) {}



  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const isInputFocused = ['INPUT', 'TEXTAREA'].includes(
      document.activeElement?.tagName || ''
    );

    if (event.key === '/' && !isInputFocused) {
      event.preventDefault();
      this.isSearchOpen = true;
    }

    if (event.key === 'Escape') {
      this.isSearchOpen = false;
    }
  }

  onSearchOpen(): void {
    this.isSearchOpen = true;
  }

  onToggleSidebar(): void {
    this.layout.toggle();
  }

  closeSidebar(): void {
    this.showSidebar = false;
  }
}
