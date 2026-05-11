import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'lightning-icon',
  templateUrl: './lightning-icon.component.html',
  styleUrls: ['./lightning-icon.component.scss']
})
export class LightningIconComponent implements OnInit, OnChanges {
  @Input() iconName!: string;
  @Input() size: 'xx-small' | 'x-small' | 'small' | 'medium' | 'large' | 'x-large' = 'medium';
  @Input() variant: 'bare' | 'container' | 'border' | 'border-filled' = 'bare';
  @Input() alternativeText: string = '';
  @Input() title: string = '';

  iconSvg: SafeHtml = '';
  iconCategory: string = '';
  iconId: string = '';

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.parseIconName();
    this.loadIconSvg();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['iconName'] && !changes['iconName'].firstChange) {
      this.parseIconName();
      this.loadIconSvg();
    }
  }

  private parseIconName() {
    if (this.iconName && this.iconName.includes(':')) {
      const parts = this.iconName.split(':');
      this.iconCategory = parts[0];
      this.iconId = parts[1];
    }
  }

  private loadIconSvg() {
    const svg = this.getIconSvg(this.iconCategory, this.iconId);
    this.iconSvg = this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  private getIconSvg(category: string, iconId: string): string {
    // Simplified Salesforce Lightning Design System utility icons with smaller viewBox
    const utilityIcons: { [key: string]: string } = {
      'home': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>`,
      'search': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>`,
      'folder': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>`,
      'open_folder': `<svg viewBox="0 -960 960 960" fill="currentColor">
        <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640H447l-80-80H160v480l96-320h684L837-217q-8 26-29.5 41.5T760-160H160Z"/>
      </svg>`,
      'folder_copy': `<svg viewBox="0 -960 960 960" fill="currentColor">
        <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h200l80 80h240q33 0 56.5 23.5T960-720v400q0 33-23.5 56.5T880-240H360Zm0-80h520v-400H607l-80-80H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h560v80H200Z"/>
      </svg>`,
      'tag': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
      </svg>`,
      'chevronright': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
      </svg>`,
      'chevronleft': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
      </svg>`,
      'chevrondown': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
      </svg>`,
      'chevronup': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
      </svg>`,
      'close': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>`,
      'info': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>`,
      'link': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H6.9C4.01 7 1.8 9.21 1.8 12s2.21 5 5.1 5h4v-1.9H6.9c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9.1-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.89 0 5.1-2.21 5.1-5s-2.21-5-5.1-5z"/>
      </svg>`,
      'share': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.50-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
      </svg>`,
      'twitter': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
      </svg>`,
      'facebook': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>`,
      'linkedin': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>`,
      'email': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
      </svg>`,
      'new_window': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z"/>
      </svg>`,
      'preview': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
      </svg>`,
      'zoomin': `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/>
      </svg>`,
      'download': `<svg viewBox="0 0 32 32" fill="currentColor">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M29.8463 19.0767H28.0002C27.5079 19.0767 27.0771 19.5075 27.0771 19.9998V26.1538C27.0771 26.6461 26.6463 27.0768 26.154 27.0768H5.84634C5.35403 27.0768 4.92326 26.6461 4.92326 26.1538V19.9998C4.92326 19.5075 4.4925 19.0767 4.00019 19.0767H2.15403C1.66173 19.0767 1.23096 19.5075 1.23096 19.9998V28.3076C1.23096 29.6615 2.33865 30.7692 3.6925 30.7692H28.3079C29.6617 30.7692 30.7694 29.6615 30.7694 28.3076V19.9998C30.7694 19.5075 30.3386 19.0767 29.8463 19.0767ZM15.3848 23.1387C15.7541 23.508 16.3079 23.508 16.6772 23.1387L24.9848 14.8309C25.3541 14.4617 25.3541 13.9078 24.9848 13.5386L23.6925 12.2463C23.3233 11.877 22.7695 11.877 22.4002 12.2463L18.9541 15.6925C18.5848 16.0617 17.9079 15.8155 17.9079 15.2617V2.1538C17.8464 1.66149 17.3541 1.23071 16.9233 1.23071H15.0772C14.5848 1.23071 14.1541 1.66149 14.1541 2.1538V15.2002C14.1541 15.754 13.4772 16.0002 13.1079 15.6309L9.66173 12.1847C9.29249 11.8155 8.73865 11.8155 8.36942 12.1847L7.07711 13.477C6.70788 13.8463 6.70788 14.4001 7.07711 14.7694L15.3848 23.1387Z"/>
      </svg>`
    };

    return utilityIcons[iconId] || '';
  }

  get containerClasses(): string {
    const classes = ['slds-icon_container'];
    
    if (this.variant === 'container') {
      classes.push(`slds-icon-${this.iconCategory}-${this.iconId}`);
    }
    
    return classes.join(' ');
  }

  get iconClasses(): string {
    const classes = ['slds-icon'];
    
    classes.push(`slds-icon_${this.size}`);
    
    if (this.variant === 'border') {
      classes.push('slds-icon_border');
    } else if (this.variant === 'border-filled') {
      classes.push('slds-icon_border-filled');
    }
    
    return classes.join(' ');
  }
}
