/**
 * Timing constants for UI operations
 * Centralized configuration for all timing-related delays and durations
 */
export const TIMING = {
  /**
   * Delay for DOM render operations
   * Reduced from 200ms to improve initial load time
   * Using requestAnimationFrame is preferred when possible
   */
  DOM_RENDER_DELAY: 50,

  /**
   * Delay for initial hash navigation
   * Reduced from 300ms to 100ms for faster response
   */
  INITIAL_HASH_DELAY: 100,

  /**
   * Delay for observer setup
   * Set to 0 as we use requestAnimationFrame instead
   */
  OBSERVER_SETUP_DELAY: 0,

  /**
   * Animation duration for smooth transitions
   */
  ANIMATION_DURATION: 300,

  /**
   * Scroll debounce delay
   */
  SCROLL_DEBOUNCE: 100
} as const;

/**
 * Type for timing constants
 */
export type TimingConstants = typeof TIMING;
