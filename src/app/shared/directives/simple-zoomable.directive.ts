import { Directive, ElementRef, Renderer2, HostListener, AfterViewInit, OnDestroy, Input } from '@angular/core';

@Directive({
  selector: '[appSimpleZoomable]'
})
export class SimpleZoomableDirective implements AfterViewInit, OnDestroy {
  @Input() enableHoverZoom: boolean = true; // Control hover zoom effect, default enabled for backward compatibility

  private backdropEl?: HTMLElement;
  private clonedImg?: HTMLImageElement;
  private downloadBtn?: HTMLElement;
  private closeBtn?: HTMLElement;
  private zoomed = false;
  private clickListener?: (event: Event) => void;
  private mutationObserver?: MutationObserver;

  constructor(
    private el: ElementRef<HTMLElement>,
    private rd: Renderer2
  ) {}

  ngAfterViewInit(): void {
    this.setupImageClickHandlers();
    this.setupMutationObserver();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private setupImageClickHandlers(): void {
    const container = this.el.nativeElement;

    this.clickListener = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'IMG' && !target.hasAttribute('noZoom')) {
        event.preventDefault();
        event.stopPropagation();
        this.zoomImage(target as HTMLImageElement);
      }

      // Handle clickable text elements
      if (target.classList.contains('clickable-image')) {
        event.preventDefault();
        event.stopPropagation();
        const imageSrc = target.getAttribute('data-src');
        if (imageSrc) {
          this.zoomImageFromSrc(imageSrc);
        }
      }
    };

    container.addEventListener('click', this.clickListener, true);
    this.updateImageStyles();
    this.updateClickableTextStyles();
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === 'IMG') {
                this.styleImage(element as HTMLImageElement);
              } else {
                const images = element.querySelectorAll('img:not([noZoom])');
                images.forEach(img => this.styleImage(img as HTMLImageElement));

                // Also process clickable text elements
                const clickableTexts = element.querySelectorAll('.clickable-image');
                clickableTexts.forEach((text) => {
                  const textElement = text as HTMLElement;
                  if (!textElement.hasAttribute('data-clickable-processed')) {
                    this.rd.setStyle(textElement, 'cursor', 'pointer');
                    textElement.setAttribute('data-clickable-processed', 'true');
                  }
                });
              }
            }
          });
        }
      });
    });

    this.mutationObserver.observe(this.el.nativeElement, {
      childList: true,
      subtree: true
    });
  }

  private updateImageStyles(): void {
    const images = this.el.nativeElement.querySelectorAll('img:not([noZoom])');
    images.forEach(img => {
      this.styleImage(img as HTMLImageElement);
    });
  }

  private styleImage(img: HTMLImageElement): void {
    if (img.hasAttribute('data-zoomable-processed')) {
      return;
    }

    this.rd.setStyle(img, 'cursor', 'zoom-in');
    this.rd.setStyle(img, 'transition', 'transform 0.2s ease');

    // Only add hover zoom effect if enabled
    if (this.enableHoverZoom) {
      const mouseEnterHandler = () => {
        if (!this.zoomed) {
          this.rd.setStyle(img, 'transform', 'scale(1.02)');
        }
      };

      const mouseLeaveHandler = () => {
        if (!this.zoomed) {
          this.rd.setStyle(img, 'transform', 'scale(1)');
        }
      };

      img.addEventListener('mouseenter', mouseEnterHandler);
      img.addEventListener('mouseleave', mouseLeaveHandler);
    }

    img.setAttribute('data-zoomable-processed', 'true');
    
    if (img.complete) {
      this.rd.addClass(img, 'faq-image');
    } else {
      img.addEventListener('load', () => {
        this.rd.addClass(img, 'faq-image');
      }, { once: true });
    }
  }

  private zoomImage(img: HTMLImageElement): void {
    if (this.zoomed) {
      this.closeZoom();
    } else {
      this.openZoom(img);
    }
  }

  private openZoom(img: HTMLImageElement): void {
    if (!img.complete || img.naturalWidth === 0) {
      return;
    }

    this.backdropEl = this.rd.createElement('div');
    this.rd.setStyle(this.backdropEl, 'position', 'fixed');
    this.rd.setStyle(this.backdropEl, 'top', '0');
    this.rd.setStyle(this.backdropEl, 'left', '0');
    this.rd.setStyle(this.backdropEl, 'width', '100vw');
    this.rd.setStyle(this.backdropEl, 'height', '100vh');
    this.rd.setStyle(this.backdropEl, 'background', 'rgba(0, 0, 0, 0.8)');
    this.rd.setStyle(this.backdropEl, 'z-index', '9999');
    this.rd.setStyle(this.backdropEl, 'display', 'flex');
    this.rd.setStyle(this.backdropEl, 'align-items', 'center');
    this.rd.setStyle(this.backdropEl, 'justify-content', 'center');
    this.rd.setStyle(this.backdropEl, 'cursor', 'zoom-out');

    this.clonedImg = img.cloneNode(true) as HTMLImageElement;
    
    const maxWidth = window.innerWidth * 0.95;
    const maxHeight = window.innerHeight * 0.9;
    const imgRatio = img.naturalWidth / img.naturalHeight;

    let finalWidth: number;
    let finalHeight: number;

    finalWidth = maxWidth;
    finalHeight = finalWidth / imgRatio;

    if (finalHeight > maxHeight) {
      finalHeight = maxHeight;
      finalWidth = finalHeight * imgRatio;
    }
    this.rd.setStyle(this.clonedImg, 'width', `${finalWidth}px`);
    this.rd.setStyle(this.clonedImg, 'height', `${finalHeight}px`);
    this.rd.setStyle(this.clonedImg, 'max-width', 'none');
    this.rd.setStyle(this.clonedImg, 'max-height', 'none');
    this.rd.setStyle(this.clonedImg, 'border-radius', '8px');
    this.rd.setStyle(this.clonedImg, 'box-shadow', '0 8px 32px rgba(0, 0, 0, 0.3)');
    this.rd.setStyle(this.clonedImg, 'cursor', 'zoom-out');
    this.rd.setStyle(this.clonedImg, 'user-select', 'none');
    this.rd.setStyle(this.clonedImg, 'pointer-events', 'none');

    
    this.rd.appendChild(this.backdropEl, this.clonedImg);
    

    this.closeBtn = this.rd.createElement('button');
    this.rd.setStyle(this.closeBtn, 'position', 'fixed');
    this.rd.setStyle(this.closeBtn, 'top', '20px');
    this.rd.setStyle(this.closeBtn, 'right', '20px');
    this.rd.setStyle(this.closeBtn, 'z-index', '10001');
    this.rd.setStyle(this.closeBtn, 'width', '48px');
    this.rd.setStyle(this.closeBtn, 'height', '48px');
    this.rd.setStyle(this.closeBtn, 'border-radius', '50%');
    this.rd.setStyle(this.closeBtn, 'background', 'rgba(0, 0, 0, 0.6)');
    this.rd.setStyle(this.closeBtn, 'border', 'none');
    this.rd.setStyle(this.closeBtn, 'color', 'white');
    this.rd.setStyle(this.closeBtn, 'cursor', 'pointer');
    this.rd.setStyle(this.closeBtn, 'display', 'flex');
    this.rd.setStyle(this.closeBtn, 'align-items', 'center');
    this.rd.setStyle(this.closeBtn, 'justify-content', 'center');
    this.rd.setStyle(this.closeBtn, 'transition', 'background 0.3s ease');
    this.rd.setAttribute(this.closeBtn, 'title', 'Close');

    const closeIconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    if (this.closeBtn) {
      this.closeBtn.innerHTML = closeIconSvg;

      this.closeBtn.addEventListener('mouseenter', () => {
        if (this.closeBtn) {
          this.rd.setStyle(this.closeBtn, 'background', 'rgba(0, 0, 0, 0.8)');
        }
      });

      this.closeBtn.addEventListener('mouseleave', () => {
        if (this.closeBtn) {
          this.rd.setStyle(this.closeBtn, 'background', 'rgba(0, 0, 0, 0.6)');
        }
      });

      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeZoom();
      });

      this.rd.appendChild(document.body, this.closeBtn);
    }

    this.downloadBtn = this.rd.createElement('button');
    this.rd.setStyle(this.downloadBtn, 'position', 'fixed');
    this.rd.setStyle(this.downloadBtn, 'top', '20px');
    this.rd.setStyle(this.downloadBtn, 'right', '80px');
    this.rd.setStyle(this.downloadBtn, 'z-index', '10001');
    this.rd.setStyle(this.downloadBtn, 'width', '48px');
    this.rd.setStyle(this.downloadBtn, 'height', '48px');
    this.rd.setStyle(this.downloadBtn, 'border-radius', '50%');
    this.rd.setStyle(this.downloadBtn, 'background', 'rgba(0, 0, 0, 0.6)');
    this.rd.setStyle(this.downloadBtn, 'border', 'none');
    this.rd.setStyle(this.downloadBtn, 'color', 'white');
    this.rd.setStyle(this.downloadBtn, 'cursor', 'pointer');
    this.rd.setStyle(this.downloadBtn, 'display', 'flex');
    this.rd.setStyle(this.downloadBtn, 'align-items', 'center');
    this.rd.setStyle(this.downloadBtn, 'justify-content', 'center');
    this.rd.setStyle(this.downloadBtn, 'transition', 'background 0.3s ease');
    this.rd.setAttribute(this.downloadBtn, 'title', 'Download image');
    
    
    const iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    `;
    if (this.downloadBtn) {
      this.downloadBtn.innerHTML = iconSvg;
      
      
      this.downloadBtn.addEventListener('mouseenter', () => {
        if (this.downloadBtn) {
          this.rd.setStyle(this.downloadBtn, 'background', 'rgba(0, 0, 0, 0.8)');
        }
      });
      
      this.downloadBtn.addEventListener('mouseleave', () => {
        if (this.downloadBtn) {
          this.rd.setStyle(this.downloadBtn, 'background', 'rgba(0, 0, 0, 0.6)');
        }
      });
      
      
      this.downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadImage(img);
      });
      
      
      this.rd.appendChild(document.body, this.downloadBtn);
    }
    
    
    this.backdropEl?.addEventListener('click', () => this.closeZoom(), { once: true });
    
    
    this.rd.appendChild(document.body, this.backdropEl);
    this.rd.setStyle(document.body, 'overflow', 'hidden');

    this.zoomed = true;
    window.dispatchEvent(new Event('zoomStart'));
  }

  private closeZoom(): void {
    if (this.backdropEl) {
      this.rd.removeChild(document.body, this.backdropEl);
      this.backdropEl = undefined;
    }

    if (this.downloadBtn) {
      this.rd.removeChild(document.body, this.downloadBtn);
      this.downloadBtn = undefined;
    }

    if (this.closeBtn) {
      this.rd.removeChild(document.body, this.closeBtn);
      this.closeBtn = undefined;
    }

    if (this.clonedImg) {
      this.clonedImg = undefined;
    }

    this.rd.removeStyle(document.body, 'overflow');
    this.zoomed = false;
    window.dispatchEvent(new Event('zoomEnd'));
  }
  
  private zoomImageFromSrc(src: string): void {
    const tempImg = new Image();
    tempImg.src = src;

    tempImg.onload = () => {
      this.openZoom(tempImg);
    };

    tempImg.onerror = () => {
      console.error('Failed to load image:', src);
    };
  }

  private updateClickableTextStyles(): void {
    const clickableTexts = this.el.nativeElement.querySelectorAll('.clickable-image');
    clickableTexts.forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.hasAttribute('data-clickable-processed')) {
        return;
      }

      this.rd.setStyle(htmlElement, 'cursor', 'pointer');
      htmlElement.setAttribute('data-clickable-processed', 'true');
    });
  }

  private downloadImage(img: HTMLImageElement): void {
    const link = document.createElement('a');
    link.href = img.src;
    
    // Extract filename from URL or use default
    let filename = 'image.png';
    try {
      const url = new URL(img.src);
      const pathname = url.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      if (lastSlash !== -1) {
        filename = pathname.substring(lastSlash + 1) || 'image.png';
      }
      // Ensure filename has an extension
      if (!filename.includes('.')) {
        filename = filename + '.png';
      }
    } catch (e) {
      // If URL parsing fails, use default filename
      filename = 'image.png';
    }
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private cleanup(): void {
    if (this.clickListener) {
      this.el.nativeElement.removeEventListener('click', this.clickListener, true);
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.zoomed) {
      this.closeZoom();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.zoomed) {
      event.preventDefault();
      this.closeZoom();
    }
  }
}
