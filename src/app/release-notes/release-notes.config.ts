// Keep RELEASES_PER_PAGE in sync with scripts/gen-prerender-routes.mjs, which
// uses the same number to list the /release-notes/page/N routes to prerender.
export const RELEASES_PER_PAGE = 5;

export const RELEASE_NOTES_PATH = '/release-notes';

/** Page 1 is the section root; later pages are path-based so they prerender. */
export function releaseNotesPagePath(page: number): string {
  return page <= 1 ? RELEASE_NOTES_PATH : `${RELEASE_NOTES_PATH}/page/${page}`;
}
