/**
 * IntersectionObserver configuration constants
 * Centralized configuration for scroll observation and section detection
 */
export const INTERSECTION_CONFIG = {
  /**
   * Header height offset in pixels
   * This accounts for the fixed header at the top of the page
   */
  HEADER_OFFSET: 80,

  /**
   * Bottom margin in pixels
   * Using fixed pixel value instead of percentage for more predictable behavior
   * Reduced from 300px to 150px to expand detection area
   * This ensures sections near page bottom can be detected
   * On 1080p screen: observation area = 1080 - 80 - 150 = 850px (79% of viewport)
   */
  BOTTOM_MARGIN: 150,

  /**
   * Multiple threshold values for improved detection accuracy
   * 0: Triggers when element just enters viewport
   * 0.1: Triggers when 10% of element is visible
   * 0.25-1.0: Progressive visibility checkpoints
   */
  THRESHOLDS: [0, 0.1, 0.25, 0.5, 0.75, 1.0],

  /**
   * Minimum intersection ratio to consider section as "visible"
   * Increased from 0.1 (10%) to 0.15 (15%) to reduce false positives
   * This ensures users actually see the content before TOC highlights it
   */
  VISIBILITY_THRESHOLD: 0.15
} as const;

/**
 * Type for intersection configuration
 */
export type IntersectionConfig = typeof INTERSECTION_CONFIG;
