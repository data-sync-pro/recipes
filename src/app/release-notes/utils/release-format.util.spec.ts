import { formatReleaseDate, releaseItemAnchor, releaseSlug } from './release-format.util';

describe('release-format.util', () => {
  it('turns a version into its slug', () => {
    expect(releaseSlug('3.604')).toBe('v3-604');
    expect(releaseSlug('1.90')).toBe('v1-90');
  });

  it('builds an item anchor from the version and the slugified title', () => {
    expect(releaseItemAnchor('3.604', 'Column Filter fields renamed, with updated help text')).toBe(
      'v3-604-column-filter-fields-renamed-with-updated-help-text'
    );
  });

  it('writes the date out exactly as authored, whatever the time zone', () => {
    expect(formatReleaseDate('2026-11-03')).toBe('November 3, 2026');
    expect(formatReleaseDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatReleaseDate('2026-12-31')).toBe('December 31, 2026');
  });

  it('leaves a value that is not YYYY-MM-DD untouched', () => {
    expect(formatReleaseDate('Nov 3')).toBe('Nov 3');
    expect(formatReleaseDate('2026-13-01')).toBe('2026-13-01');
  });
});
