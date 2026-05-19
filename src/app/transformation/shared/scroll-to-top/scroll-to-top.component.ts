import { Component, Input, AfterViewInit } from '@angular/core';

@Component({
  selector: 'app-scroll-to-top',
  templateUrl: './scroll-to-top.component.html',
  styleUrls: ['./scroll-to-top.component.css']
})
export class ScrollToTopComponent implements AfterViewInit {
  @Input() scrollContainer!: HTMLElement;
  isVisible: boolean = false;

  ngAfterViewInit() {
    if (!this.scrollContainer) return;

    this.scrollContainer.addEventListener('scroll', () => {
      this.isVisible = this.scrollContainer.scrollTop > 200;
    });
  }

  scrollToTop() {
    if (!this.scrollContainer) return;
    this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
