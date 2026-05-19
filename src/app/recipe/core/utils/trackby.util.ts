/**
 * TrackBy Utility
 *
 * Provides reusable trackBy functions for Angular ngFor directives.
 * Using trackBy improves performance by helping Angular identify which items
 * have changed, been added, or been removed.
 */
export class TrackByUtil {
  /**
   * Track by array index
   * Use this when array items don't have unique IDs
   * @param index - The index of the item
   * @returns The index
   */
  static index(index: number): number {
    return index;
  }

  /**
   * Track by item's id property
   * Use this when array items have unique id properties
   * @param index - The index of the item
   * @param item - The item with an id property
   * @returns The item's id
   */
  static id(_index: number, item: { id: string | number }): string | number {
    return item.id;
  }
}
