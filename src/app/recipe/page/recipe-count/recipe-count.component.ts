import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * Small, low-key count badge shown after a label (e.g. the recipe count after
 * a category name in the nav sidebar). Purely presentational.
 */
@Component({
  selector: 'app-recipe-count',
  templateUrl: './recipe-count.component.html',
  styleUrls: ['./recipe-count.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeCountComponent {
  /** The number to display. */
  @Input() count: number = 0;
}
