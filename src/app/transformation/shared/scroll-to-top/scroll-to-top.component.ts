import { Component, Input, AfterViewInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-scroll-to-top',
  templateUrl: './scroll-to-top.component.html',
  styleUrls: ['./scroll-to-top.component.css']
})
export class ScrollToTopComponent implements AfterViewInit, OnDestroy {
  @Input() scrollContainer!: HTMLElement;
  isVisible: boolean = false;

  private scrollHandler?: () => void;

  ngAfterViewInit() {
    if (!this.scrollContainer) return;

    this.scrollHandler = () => {
      this.isVisible = this.scrollContainer.scrollTop > 200;
    };
    this.scrollContainer.addEventListener('scroll', this.scrollHandler);
  }

  ngOnDestroy() {
    if (this.scrollContainer && this.scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
    }
  }

  scrollToTop() {
    if (!this.scrollContainer) return;
    this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
