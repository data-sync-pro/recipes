/**
 * Utility functions for generating URL-friendly slugs
 */

/**
 * Generate a URL-friendly slug from a title string
 *
 * Rules:
 * - Convert to lowercase
 * - Replace all non-alphanumeric characters with hyphens
 * - Merge consecutive hyphens into a single hyphen
 * - Remove leading and trailing hyphens
 *
 * Examples:
 * - "Accept Cases from My Queues" → "accept-cases-from-my-queues"
 * - "Account 360° View" → "account-360-view"
 * - "Copy & Transform Records" → "copy-transform-records"
 *
 * @param title The title string to convert
 * @returns URL-friendly slug string
 */
export function generateSlug(title: string): string {
  if (!title) {
    return '';
  }

  return title
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric characters with hyphen
    .replace(/-+/g, '-') // Merge consecutive hyphens
    .replace(/^-|-$/g, ''); // Remove leading and trailing hyphens
}
