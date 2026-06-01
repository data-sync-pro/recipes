import { ChangeDetectorRef, Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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

  // Shared across all instances so each icon file is fetched at most once.
  private static cache = new Map<string, Promise<string>>();

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private cd: ChangeDetectorRef
  ) {}

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

  private async loadIconSvg() {
    if (!this.iconCategory || !this.iconId) return;
    const key = `${this.iconCategory}:${this.iconId}`;
    let promise = LightningIconComponent.cache.get(key);
    if (!promise) {
      const url = `assets/icons/${this.iconCategory}/${this.iconId}.svg`;
      promise = firstValueFrom(this.http.get(url, { responseType: 'text' }));
      LightningIconComponent.cache.set(key, promise);
    }
    try {
      const svg = await promise;
      this.iconSvg = this.sanitizer.bypassSecurityTrustHtml(svg);
    } catch {
      LightningIconComponent.cache.delete(key);
      this.iconSvg = '';
    }
    this.cd.markForCheck();
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
