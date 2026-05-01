// ==================== Core Recipe Data Models ====================

/**
 * Recipe source data structure (persisted to JSON files)
 */
export interface RecipeData {
  id: string;
  title: string;
  category: string | string[];  // Support both old (string) and new (string[]) format
  DSPVersions: string[];
  overview: string;
  generalUseCase?: string;
  generalImages: GeneralImage[];
  prerequisites: PrerequisiteRecipe[];
  pipeline: string;
  direction: string;
  connection: string;
  walkthrough: WalkthroughStep[];
  verificationGIF: VerificationGIF[];
  downloadableExecutables: DownloadableExecutable[];
  downloadFileCallout?: {
    variant: 'info' | 'warning' | 'error' | 'success';
    content: string;
  };
  relatedRecipes: RelatedRecipe[];
  keywords: string[];
}

/**
 * Recipe runtime data structure (with computed fields)
 */
export interface Recipe {
  id: string;
  title: string;
  slug?: string;
  category: string[];  // Always array at runtime
  DSPVersions: string[];
  overview: string;
  generalUseCase?: string;
  generalImages: GeneralImage[];
  prerequisites: PrerequisiteRecipe[];
  pipeline: string,
  direction: string;
  connection: string;
  walkthrough: WalkthroughStep[];
  verificationGIF: VerificationGIF[];
  downloadableExecutables: DownloadableExecutable[];
  downloadFileCallout?: {
    variant: 'info' | 'warning' | 'error' | 'success';
    content: string;
  };
  relatedRecipes: RelatedRecipe[];
  keywords: string[];
  isExpanded?: boolean;
  isLoading?: boolean;
  showSocialShare?: boolean;
}

/**
 * Recipe preview data structure (used for preview windows)
 */
export interface RecipePreviewData {
  recipeId: string;
  title: string;
  category: string[];  // Always array at runtime
  recipeData: RecipeData;
  timestamp: number;
}

// ==================== Recipe Component Models ====================

/**
 * General media (image/video/gif) used in recipes
 */
export interface GeneralImage {
  type: 'image' | 'video' | 'gif';
  url: string;
  alt: string;
  imageId?: string;
  displayUrl?: string;
}

/**
 * Verification GIF media (only video or gif)
 */
export interface VerificationGIF {
  type: 'video' | 'gif';
  url: string;
  alt: string;
  displayUrl?: string;
}

/**
 * Walkthrough step in recipe instructions
 */
export interface WalkthroughStep {
  step: string;
  config: StepConfig[];
  media: StepMedia[];
}

/**
 * Configuration field in a walkthrough step
 */
export interface StepConfig {
  field: string;
  value: string;
}

/**
 * Media item in a walkthrough step
 */
export interface StepMedia {
  type: string;
  url: string;
  alt: string;
  displayUrl?: string;
}

/**
 * Prerequisite recipe requirement
 */
export interface PrerequisiteRecipe {
  description: string;
  quickLinks: QuickLink[];
}

/**
 * Quick link in prerequisites
 */
export interface QuickLink {
  title: string;
  url: string;
}

/**
 * Downloadable executable file
 */
export interface DownloadableExecutable {
  title?: string;
  url?: string;
  filePath?: string;
}

/**
 * Related recipe reference
 */
export interface RelatedRecipe {
  title: string;
  url: string;
}

// ==================== Category & Search Models ====================

/**
 * Recipe category with metadata
 */
export interface Category {
  name: string;
  displayName: string;
  count: number;
}

/**
 * Search result with relevance score
 */
export interface SearchResult extends Recipe {
  relevanceScore?: number;
}

/**
 * Search state for search overlay
 */
export interface SearchState {
  query: string;
  isActive: boolean;
  results: SearchResult[];
  hasResults: boolean;
  isOverlayOpen: boolean;
}

/**
 * Filter criteria for recipes
 */
export interface Filter {
  categories: string[];
}

// ==================== Navigation & UI Models ====================

/**
 * Navigation state for routing
 */
export interface NavigationState {
  category: string;
  recipeName: string;
}

/**
 * Table of contents section
 */
export interface Section {
  id: string;
  title: string;
  elementId?: string;
}

/**
 * Table of contents tab
 */
export interface Tab {
  id: string;
  title: string;
  sections: Section[];
}

// ==================== Data Loading Models ====================

export interface RecipeIndexItem {
  folderId: string;
  name: string;
  category: string;
  active: boolean;
}

// ==================== Editor Models ====================

/**
 * Editor tab containing a recipe
 */
export interface EditorTab {
  id: string;
  title: string;
  recipe: RecipeData;
  hasChanges: boolean;
  isActive: boolean;
}

// ==================== Utility Functions ====================

/**
 * Normalize category to array format
 * Handles backward compatibility with old string format
 */
export function normalizeCategory(category: string | string[] | undefined): string[] {
  if (!category) return [];
  if (Array.isArray(category)) return category;
  return [category];
}
