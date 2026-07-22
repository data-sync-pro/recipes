import { RecipeData, isLegacyWalkthrough, WalkthroughStep, WalkthroughTab } from '../models/recipe.model';
import { RECIPE_PATHS, CATEGORY_ORDER, expandCategory } from '../constants/recipe.constants';

/**
 * Manual per-category recipe ordering. Maps a category display name to an
 * ordered list of recipe slugs. Sourced from assets/recipes/category-order.json.
 */
export type CategoryOrderMap = Record<string, string[]>;

// 2D map: customStepNames[tabIndex][stepIndex] → user-supplied name for Custom steps
export type CleanRecipeCustomStepNames = { [tabIndex: number]: { [stepIndex: number]: string } };

export interface CleanRecipeOptions {
  removeRuntimeProps?: boolean;
  removeInternalProps?: boolean;
  normalizeImagePaths?: boolean;
  customStepNames?: CleanRecipeCustomStepNames;
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

function normalizeImageUrl(url: string): string {
  if (!url) return url;

  if (url.startsWith('images/')) {
    return url;
  }

  if (url.includes(RECIPE_PATHS.RECIPE_FOLDERS_BASE)) {
    const match = url.match(/images\/[^/]+$/);
    if (match) {
      return match[0];
    }
  }

  return url;
}

function normalizeExecutablePath(path: string): string {
  if (!path) return path;

  if (path.startsWith('downloadExecutables/')) {
    return path;
  }

  if (path.includes(RECIPE_PATHS.RECIPE_FOLDERS_BASE)) {
    const match = path.match(/downloadExecutables\/[^/]+$/);
    if (match) {
      return match[0];
    }
  }

  return path;
}

function cleanRecipeData(
  recipe: RecipeData,
  options: CleanRecipeOptions = {}
): RecipeData {
  if (!recipe) {
    return recipe;
  }

  const cleaned = deepClone(recipe);

  if (options.removeInternalProps) {
    delete (cleaned as any).internalId;
    delete (cleaned as any).editorState;
  }

  if (cleaned.walkthrough && Array.isArray(cleaned.walkthrough) && cleaned.walkthrough.length > 0) {
    // Walk both legacy flat WalkthroughStep[] and new tab-grouped WalkthroughTab[].
    // For legacy, treat as single tab at index 0 for customStepNames lookup.
    const cleanStep = (step: WalkthroughStep, tabIndex: number, stepIndex: number) => {
      if (step.media && Array.isArray(step.media)) {
        step.media.forEach((media: any) => {
          if (options.removeRuntimeProps) {
            delete media.displayUrl;
            delete media.imageKey;
          }
          if (options.normalizeImagePaths && media.url) {
            media.url = normalizeImageUrl(media.url);
          }
        });
      }
      if (options.customStepNames && step.step === 'Custom') {
        const customName = options.customStepNames[tabIndex]?.[stepIndex];
        if (customName) {
          step.step = customName;
        }
      }
    };

    if (isLegacyWalkthrough(cleaned.walkthrough)) {
      (cleaned.walkthrough as WalkthroughStep[]).forEach((step, si) => cleanStep(step, 0, si));
    } else {
      (cleaned.walkthrough as WalkthroughTab[]).forEach((tab, ti) => {
        if (tab.steps && Array.isArray(tab.steps)) {
          tab.steps.forEach((step, si) => cleanStep(step, ti, si));
        }
      });
    }
  }

  if (cleaned.generalImages && Array.isArray(cleaned.generalImages)) {
    cleaned.generalImages.forEach((image: any) => {
      if (options.removeRuntimeProps) {
        delete image.displayUrl;
        delete image.imageKey;
      }

      if (options.normalizeImagePaths && image.url) {
        image.url = normalizeImageUrl(image.url);
      }
    });
  }

  if (cleaned.downloadableExecutables && Array.isArray(cleaned.downloadableExecutables)) {
    cleaned.downloadableExecutables.forEach((executable: any) => {
      if (options.normalizeImagePaths && executable.filePath) {
        executable.filePath = normalizeExecutablePath(executable.filePath);
      }
    });
  }

  return cleaned;
}

export function cleanRecipeForStorage(recipe: RecipeData): RecipeData {
  return cleanRecipeData(recipe, {
    removeRuntimeProps: true,
    normalizeImagePaths: true
  });
}

export function cleanRecipeForExport(
  recipe: RecipeData,
  customStepNames?: CleanRecipeCustomStepNames
): RecipeData {
  return cleanRecipeData(recipe, {
    removeInternalProps: true,
    removeRuntimeProps: true,
    customStepNames
  });
}

export function sortRecipesByCategoryAndTitle<T extends { category: string | string[]; title: string }>(recipes: T[]): T[] {
  const rankOf = (cat: string): number => {
    const idx = CATEGORY_ORDER.findIndex(c => c.displayName === cat);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  return [...recipes].sort((a, b) => {
    const catA = Array.isArray(a.category) ? (a.category[0] || '') : a.category;
    const catB = Array.isArray(b.category) ? (b.category[0] || '') : b.category;
    const rankA = rankOf(catA);
    const rankB = rankOf(catB);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    // Unknown categories: fall back to alphabetical category compare so they
    // group together instead of interleaving by title.
    if (rankA === Number.MAX_SAFE_INTEGER) {
      const catCompare = catA.localeCompare(catB);
      if (catCompare !== 0) return catCompare;
    }
    return a.title.localeCompare(b.title);
  });
}

/**
 * Pure alphabetical sort by title. Used for the "All Recipes" view, which is a
 * flat list with no category grouping, so a straight A→Z reads most naturally.
 */
export function sortRecipesByTitle<T extends { title: string }>(recipes: T[]): T[] {
  return [...recipes].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Order recipes within a single category using the manual order in
 * `orderMap`. Recipes whose slug is listed appear first, in that order;
 * any recipe not listed (e.g. a newly added one) falls back to the end,
 * sorted alphabetically by title — so an incomplete order file never hides a
 * recipe, it just appends it.
 *
 * Aggregate categories (e.g. "UI" → Data List + Action Button) are expanded
 * and their member lists concatenated in category order.
 */
export function orderRecipesWithinCategory<T extends { slug?: string; title: string }>(
  categoryName: string,
  recipes: T[],
  orderMap: CategoryOrderMap
): T[] {
  const orderedSlugs: string[] = [];
  for (const key of expandCategory(categoryName)) {
    const list = orderMap[key];
    if (list) {
      orderedSlugs.push(...list);
    }
  }

  const rankBySlug = new Map<string, number>();
  orderedSlugs.forEach((slug, index) => {
    if (!rankBySlug.has(slug)) {
      rankBySlug.set(slug, index);
    }
  });

  const rankOf = (slug?: string): number =>
    (slug && rankBySlug.has(slug)) ? rankBySlug.get(slug)! : Number.MAX_SAFE_INTEGER;

  return [...recipes].sort((a, b) => {
    const rankA = rankOf(a.slug);
    const rankB = rankOf(b.slug);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.title.localeCompare(b.title);
  });
}
