import { Component } from '@angular/core';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-function-page-main-layout',
  templateUrl: './function-page-main-layout.component.html',
  styleUrls: ['./function-page-main-layout.component.css'],
})
export class FunctionPageMainLayoutComponent {
  collapsed$ = this.layout.collapsed$;
  showSidebar = false;

  constructor(private layout: LayoutService) {}

  onToggleSidebar(): void {
    this.layout.toggle();
  }

  closeSidebar(): void {
    this.showSidebar = false;
  }
}
