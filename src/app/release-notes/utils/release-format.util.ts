// Pure string helpers for release identifiers and dates. No Date objects: a
// release date is authored text ('YYYY-MM-DD'), so it is reformatted as text
// and can never shift by a day with the viewer's (or the build's) time zone.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * '3.604' -> 'v3-604'. Used both as the release's anchor id and as its content
 * file name (assets/release-notes/releases/v3-604.json).
 */
export function releaseSlug(version: string): string {
  return `v${slugify(version)}`;
}

/** Anchor id of one item inside a release: 'v3-604-<slugified-title>'. */
export function releaseItemAnchor(version: string, title: string): string {
  return `${releaseSlug(version)}-${slugify(title)}`;
}

/** '2026-11-03' -> 'November 3, 2026'. Anything else is returned unchanged. */
export function formatReleaseDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return date;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}
