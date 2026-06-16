import { Component } from '@angular/core';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-function-page-main-layout',
  templateUrl: './function-page-main-layout.component.html',
  styleUrls: ['./function-page-main-layout.component.css'],
})
export class FunctionPageMainLayoutComponent {
  collapsed$ = this.layout.collapsed$;
  // Mobile sidebar drawer open state (≤1024px) — distinct from the desktop
  // `collapsed$` width-collapse; mirrors the recipe details sidebar.
  mobileOpen = false;

  constructor(private layout: LayoutService) {}

  // Desktop collapse/expand (the floating ☰ button).
  onToggleSidebar(): void {
    this.layout.toggle();
  }

  // Mobile drawer open/close.
  toggleMobile(): void {
    this.mobileOpen = !this.mobileOpen;
  }

  closeMobile(): void {
    this.mobileOpen = false;
  }
}
