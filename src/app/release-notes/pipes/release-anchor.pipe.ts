import { Pipe, PipeTransform } from '@angular/core';
import { releaseItemAnchor, releaseSlug } from '../utils/release-format.util';

/**
 * Anchor ids: `version | releaseAnchor` -> 'v3-604' for the release itself,
 * `version | releaseAnchor: title` -> 'v3-604-<slugified-title>' for an item.
 */
@Pipe({ name: 'releaseAnchor' })
export class ReleaseAnchorPipe implements PipeTransform {
  transform(version: string, itemTitle?: string): string {
    return itemTitle ? releaseItemAnchor(version, itemTitle) : releaseSlug(version);
  }
}
