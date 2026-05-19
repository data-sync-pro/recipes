import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'app-scroll-to-top',
  templateUrl: './scroll-to-top.component.html',
  styleUrls: ['./scroll-to-top.component.css']
})
export class ScrollToTopComponent {
  isVisible = false;  
  isZooming = false;  

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.isZooming) {
      this.isVisible = window.pageYOffset > 200;
    }
  }

  @HostListener('window:zoomStart', [])
  onZoomStart() {
    this.isZooming = true;
    this.isVisible = false;      
  }

  @HostListener('window:zoomEnd', [])
  onZoomEnd() {
    this.isZooming = false;
    this.isVisible = window.pageYOffset > 200;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
