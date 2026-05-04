import { RecipeData } from '../models/recipe.model';
import { RECIPE_PATHS } from '../constants/recipe.constants';

export interface CleanRecipeOptions {
  removeRuntimeProps?: boolean;
  removeInternalProps?: boolean;
  normalizeImagePaths?: boolean;
  customStepNames?: { [index: number]: string };
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

export function cleanRecipeData(
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

  if (cleaned.walkthrough && Array.isArray(cleaned.walkthrough)) {
    cleaned.walkthrough.forEach((step: any, index: number) => {
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
        const customName = options.customStepNames[index];
        if (customName) {
          step.step = customName;
        }
      }
    });
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
  customStepNames?: { [index: number]: string }
): RecipeData {
  return cleanRecipeData(recipe, {
    removeInternalProps: true,
    removeRuntimeProps: true,
    customStepNames
  });
}

export function sortRecipesByCategoryAndTitle<T extends { category: string | string[]; title: string }>(recipes: T[]): T[] {
  return [...recipes].sort((a, b) => {
    // Get first category for sorting (supports both string and string[])
    const catA = Array.isArray(a.category) ? (a.category[0] || '') : a.category;
    const catB = Array.isArray(b.category) ? (b.category[0] || '') : b.category;
    const categoryCompare = catA.localeCompare(catB);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }
    return a.title.localeCompare(b.title);
  });
}
