import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

export interface CardItem {
  title: string;
  slug: string;
  image?: string;
}

@Component({
  selector: 'app-setup-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupCardComponent {
  @Input() cards: CardItem[] = [];
  @Input() basePath = 'assets/setups';
  @Output() cardClick = new EventEmitter<string>();

  onCardClick(slug: string): void {
    this.cardClick.emit(slug);
  }

  getImagePath(image: string): string {
    if (image.startsWith('http') || image.startsWith('/')) {
      return image;
    }
    return `${this.basePath}/${image}`;
  }

  trackBySlug(_: number, card: CardItem): string {
    return card.slug;
  }
}
