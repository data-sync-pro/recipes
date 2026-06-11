import { Router } from '@angular/router';

/**
 * Reset the window scroll to the top when navigating to a *new* page, while
 * leaving the scroll position untouched on browser back/forward (popstate)
 * navigation so the user lands where they were.
 *
 * Why this is needed: the app sets `scrollPositionRestoration: 'disabled'`
 * globally (see AppRoutingModule) because feature areas use different scroll
 * containers — e.g. the transformation pages scroll an inner
 * `<main class="content">`, not the window. Window-scrolled pages (recipes,
 * setup) therefore have to reset their own scroll on navigation.
 *
 * IMPORTANT: must be called synchronously while the navigation is still in
 * progress (e.g. inside a `paramMap` subscription or a `NavigationEnd`
 * handler). Angular clears the current navigation once the transition
 * finalizes, so reading the trigger from a later async callback (such as an
 * HTTP-backed content load) always reports a non-popstate navigation.
 *
 * @param router    The injected Router, used to detect the navigation trigger.
 * @param isNewPage Whether navigation actually changed the displayed page.
 */
export function scrollToTopOnNavigation(router: Router, isNewPage: boolean): void {
  const isPopstate = router.getCurrentNavigation()?.trigger === 'popstate';
  if (isNewPage && !isPopstate) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}
