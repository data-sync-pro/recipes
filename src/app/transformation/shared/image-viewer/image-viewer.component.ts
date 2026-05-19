import { Component, Input, Output, EventEmitter, HostListener, OnInit } from '@angular/core';

@Component({
  selector: 'app-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.css']
})
export class ImageViewerComponent implements OnInit {
  @Input() imageUrl: string = '';
  @Input() imageAlt: string = '';
  @Output() closeViewer = new EventEmitter<void>();

  zoomLevel = 1;
  minZoom = 0.5;
  maxZoom = 3;
  zoomStep = 0.25;
  
  // Drag state
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  translateX = 0;
  translateY = 0;
  
  imageStyle = {
    transform: 'scale(1) translate(0px, 0px)',
    cursor: 'zoom-in'
  };

  ngOnInit() {
    this.updateImageStyle();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Prevent default behavior for our shortcuts
    if (['Escape', '+', '=', '-', '_', '0', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }

    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case '+':
      case '=':
      case 'ArrowUp':
        this.zoomIn();
        break;
      case '-':
      case '_':
      case 'ArrowDown':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
    }
  }

  close() {
    this.closeViewer.emit();
  }

  zoomIn() {
    if (this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
      this.updateImageStyle();
    }
  }

  zoomOut() {
    if (this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
      this.updateImageStyle();
    }
  }

  resetZoom() {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateImageStyle();
  }

  onImageClick(event: MouseEvent) {
    event.stopPropagation();
    // Only zoom if not dragging and zoom level is 1 (not zoomed)
    if (this.zoomLevel === 1) {
      this.zoomIn();
    }
  }

  onOverlayClick() {
    this.close();
  }

  private updateImageStyle() {
    const canDrag = this.zoomLevel > 1;
    let cursor = 'zoom-in';
    
    if (this.isDragging) {
      cursor = 'grabbing';
    } else if (canDrag) {
      cursor = 'grab';
    } else if (this.zoomLevel >= this.maxZoom) {
      cursor = 'zoom-out';
    }
    
    this.imageStyle = {
      transform: `scale(${this.zoomLevel}) translate(${this.translateX}px, ${this.translateY}px)`,
      cursor: cursor
    };
  }

  onMouseDown(event: MouseEvent) {
    if (this.zoomLevel > 1) {
      event.preventDefault();
      this.isDragging = true;
      this.dragStartX = event.clientX - this.translateX;
      this.dragStartY = event.clientY - this.translateY;
      this.updateImageStyle();
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isDragging) {
      event.preventDefault();
      this.translateX = event.clientX - this.dragStartX;
      this.translateY = event.clientY - this.dragStartY;
      this.updateImageStyle();
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    if (this.isDragging) {
      event.preventDefault();
      this.isDragging = false;
      this.updateImageStyle();
    }
  }
}
