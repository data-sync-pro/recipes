export const CATEGORY_ORDER: string[] = [
  'Batch',
  'Trigger',
  'Data List',
  'Action Button',
  'Data Loader',
  'Transformation',
  'Query'
];

export const RECIPE_PATHS = {
  RECIPE_FOLDERS_BASE: 'assets/recipes/',
  RECIPE_INDEX: 'assets/data/recipe-index.json'
} as const;

export const RECIPE_CLASSES = {
  BODY_PAGE: 'recipe-page'
} as const;

export const RECIPE_MESSAGES = {
  ERROR_LOAD_CATEGORIES: 'Failed to load categories. Please try again.',
  ERROR_LOAD_RECIPES: 'Failed to load recipes. Please try again.',
  ERROR_LOAD_RECIPE: 'Failed to load recipe details. Please try again.'
} as const;

export const RECIPE_SECTIONS = {
  OVERVIEW: 'overview',
  RECIPE_OVERVIEW: 'recipe-overview',
  GENERAL_USE_CASE: 'general-use-case',
  PREREQUISITES: 'prerequisites',
  RELATED: 'related-recipes',
  WALKTHROUGH: 'walkthrough',
  STEP_PREFIX: 'step-'
} as const;

export const FILE_SIZE = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024
} as const;

export const TIME_CONSTANTS = {
  MS_PER_DAY: 24 * 60 * 60 * 1000
} as const;
