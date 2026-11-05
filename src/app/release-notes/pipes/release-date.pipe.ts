import { Pipe, PipeTransform } from '@angular/core';
import { formatReleaseDate } from '../utils/release-format.util';

/** '2026-11-03' -> 'November 3, 2026', as text, with no time-zone conversion. */
@Pipe({ name: 'releaseDate' })
export class ReleaseDatePipe implements PipeTransform {
  transform(date: string): string {
    return formatReleaseDate(date);
  }
}
