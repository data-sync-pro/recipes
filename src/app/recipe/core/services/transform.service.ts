import { Injectable } from '@angular/core';
import { generateSlug } from '../../../shared/utils/slug.utils';
import { RecipeData, Recipe, WalkthroughStep, DownloadFileCallout, normalizeCategory } from '../models/recipe.model';
import { RECIPE_PATHS } from '../constants/recipe.constants';

interface RecipeDataWithMetadata extends RecipeData {
  __folderId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TransformService {

  transformRecipeRecords(records: RecipeData[]): Recipe[] {
    return records.map(record => this.transformSingleRecord(record));
  }

  transformSingleRecord(record: RecipeData): Recipe {
    const metadata = record as RecipeDataWithMetadata;
    const folderId = metadata.__folderId || record.id;

    const result: Recipe = {
      id: record.id,
      title: record.title,
      slug: generateSlug(record.title),
      category: normalizeCategory(record.category),  // Normalize to array format
      DSPVersions: record.DSPVersions || [],

      overview: record.overview || '',
      generalUseCase: record.generalUseCase || '',
      direction: record.direction || '',
      connection: record.connection || '',

      generalImages: record.generalImages || [],
      prerequisites: record.prerequisites || [],
      pipeline: record.pipeline || '',
      walkthrough: this.processWalkthroughImagePaths(
        record.walkthrough || [],
        folderId
      ),
      verificationGIF: this.processVerificationGIF(
        record.verificationGIF || [],
        folderId
      ),
      downloadableExecutables: this.processDownloadableExecutables(
        record.downloadableExecutables || [],
        folderId
      ),
      downloadFileCallout: this.processDownloadFileCallouts(
        record.downloadFileCallout || [],
        folderId
      ),
      relatedRecipes: record.relatedRecipes || [],
      keywords: record.keywords || [],

      isExpanded: false,
      isLoading: false,
      showSocialShare: false
    };

    // Preserve __folderId for asset path resolution during export
    if (metadata.__folderId) {
      (result as any).__folderId = metadata.__folderId;
    }

    return result;
  }

  private processWalkthroughImagePaths(walkthrough: WalkthroughStep[], folderId: string): WalkthroughStep[] {
    return walkthrough.map(step => {
      if (step.media && Array.isArray(step.media)) {
        step.media = step.media.map(media => {
          if (media.type === 'image' && media.url && media.url.startsWith('images/')) {
            return {
              ...media,
              url: `${RECIPE_PATHS.RECIPE_FOLDERS_BASE}${folderId}/${media.url}`
            };
          }
          return media;
        });
      }
      return step;
    });
  }

  private processVerificationGIF(verificationGIF: any[], folderId: string): any[] {
    if (!verificationGIF || !Array.isArray(verificationGIF)) {
      return [];
    }

    return verificationGIF.map(media => {
      if (media.url && !media.url.startsWith('http') && !media.url.startsWith('/')) {
        return {
          ...media,
          displayUrl: `${RECIPE_PATHS.RECIPE_FOLDERS_BASE}${folderId}/${media.url}`
        };
      }
      return media;
    });
  }

  private processDownloadFileCallouts(callouts: DownloadFileCallout[], folderId: string): DownloadFileCallout[] {
    return callouts.map(callout => ({
      ...callout,
      sections: (callout.sections || []).map(section => {
        if (!section.media || !Array.isArray(section.media)) {
          return section;
        }
        return {
          ...section,
          media: section.media.map(media => {
            if (media.url && !media.url.startsWith('http') && !media.url.startsWith('/')) {
              return {
                ...media,
                displayUrl: `${RECIPE_PATHS.RECIPE_FOLDERS_BASE}${folderId}/${media.url}`
              };
            }
            return media;
          })
        };
      })
    }));
  }

  private processDownloadableExecutables(executables: any[], folderId: string): any[] {
    if (!executables || !Array.isArray(executables)) {
      return [];
    }

    return executables.map(executable => {
      if (executable.filePath &&
          !executable.filePath.startsWith('http') &&
          !executable.filePath.startsWith('/')) {
        const fullPath = `${RECIPE_PATHS.RECIPE_FOLDERS_BASE}${folderId}/${executable.filePath}`;
        return {
          ...executable,
          filePath: fullPath,
          url: fullPath
        };
      }
      return executable;
    });
  }

}
