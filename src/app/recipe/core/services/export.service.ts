import { Injectable } from '@angular/core';
import { RecipeData } from '../models/recipe.model';
import { FileStorageAdapter } from '../storage';
import { NotificationService } from '../../../shared/services/notification.service';
import { LoggerService } from './logger.service';
import { FileResolverService } from './file-resolver.service';
import { RecipeIndexEntry, ProgressCallback } from './io.types';
import JSZip from 'jszip';
import { generateFolderName, cleanRecipeForStorage } from '../utils';

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  constructor(
    private notificationService: NotificationService,
    private logger: LoggerService,
    private fileResolver: FileResolverService
  ) {}

  /**
   * Extract image info from URL, handling both formats:
   * - 'images/xxx.png' (IndexedDB images)
   * - 'assets/recipes/folder/images/xxx.png' (transformed asset paths)
   */
  private extractImageInfo(url: string): { imageName: string; relativePath: string } | null {
    if (!url) return null;

    // Handle IndexedDB format: images/xxx.png
    if (url.startsWith('images/')) {
      const imageName = url.split('/')[1];
      return { imageName, relativePath: url };
    }

    // Handle transformed asset format: assets/recipes/folder/images/xxx.png
    const assetMatch = url.match(/assets\/recipes\/[^/]+\/(images\/[^/]+)$/);
    if (assetMatch) {
      const relativePath = assetMatch[1]; // images/xxx.png
      const imageName = relativePath.split('/')[1];
      return { imageName, relativePath };
    }

    return null;
  }

  /**
   * Extract executable info from filePath, handling both formats:
   * - 'downloadExecutables/xxx.json' (IndexedDB/new uploads)
   * - 'assets/recipes/folder/downloadExecutables/xxx.json' (transformed asset paths)
   */
  private extractExecutableInfo(filePath: string): { fileName: string; relativePath: string } | null {
    if (!filePath) return null;

    // Handle IndexedDB format: downloadExecutables/xxx.json
    if (filePath.startsWith('downloadExecutables/')) {
      const fileName = filePath.replace('downloadExecutables/', '');
      return { fileName, relativePath: filePath };
    }

    // Handle transformed asset format: assets/recipes/folder/downloadExecutables/xxx.json
    const assetMatch = filePath.match(/assets\/recipes\/[^/]+\/(downloadExecutables\/[^/]+)$/);
    if (assetMatch) {
      const relativePath = assetMatch[1]; // downloadExecutables/xxx.json
      const fileName = relativePath.replace('downloadExecutables/', '');
      return { fileName, relativePath };
    }

    return null;
  }

  async exportSingleRecipe(recipe: RecipeData): Promise<void> {
    try {
      const cleanedRecipe = cleanRecipeForStorage(recipe);
      const jsonString = JSON.stringify(cleanedRecipe, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const filename = `${cleanedRecipe.id || 'recipe'}.json`;

      this.downloadBlob(blob, filename);
      this.notificationService.success(`Recipe exported: ${filename}`);
    } catch (error) {
      this.logger.error('Error exporting single recipe', error);
      this.notificationService.error('Failed to export recipe');
    }
  }

  async exportAllAsZip(
    recipes: RecipeData[],
    fileStorage: FileStorageAdapter,
    allRecipesForIndex?: RecipeData[],
    onProgress?: ProgressCallback,
    recipeActiveStates?: Map<string, boolean>
  ): Promise<void> {
    try {
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not available');
      }

      const zip = new JSZip();
      let processedCount = 0;
      const totalSteps = recipes.length * 2;

      const updateProgress = (step: string) => {
        if (onProgress) {
          onProgress({
            step,
            current: processedCount,
            total: totalSteps
          });
        }
      };

      const existingFolders = new Set<string>();
      const recipeFolderMap = new Map<string, string>();

      recipes.forEach(recipe => {
        if (recipe.id && recipe.title) {
          const folderName = generateFolderName(recipe.title, existingFolders);
          existingFolders.add(folderName);
          recipeFolderMap.set(recipe.id, folderName);
        }
      });

      for (const recipe of recipes) {
        if (!recipe.id) continue;

        updateProgress(`Processing recipe: ${recipe.title}`);

        const cleanedRecipe = cleanRecipeForStorage(recipe);
        const folderName = recipeFolderMap.get(recipe.id) || recipe.id;
        const recipeFolder = zip.folder(folderName);
        if (!recipeFolder) continue;

        const recipeJson = JSON.stringify(cleanedRecipe, null, 2);
        recipeFolder.file('recipe.json', recipeJson);
        processedCount++;

        updateProgress(`Processing images for: ${recipe.title}`);

        if (recipe.walkthrough) {
          const imagesFolder = recipeFolder.folder('images');

          for (const step of recipe.walkthrough) {
            if (step.media) {
              for (const media of step.media) {
                if (media.type === 'image') {
                  const imageInfo = this.extractImageInfo(media.url);
                  if (imageInfo) {
                    try {
                      const imageId = this.fileResolver.extractImageId(imageInfo.imageName);

                      const imageFile = await this.fileResolver.getFileWithFallback(
                        fileStorage,
                        imageId,
                        recipe,
                        imageInfo.relativePath,
                        true
                      );

                      if (imageFile && imagesFolder) {
                        imagesFolder.file(imageInfo.imageName, imageFile);
                      }
                    } catch (error) {
                      this.logger.warn(`Failed to add image ${media.url}`, error);
                    }
                  }
                }
              }
            }
          }
        }

        if (recipe.generalImages) {
          const imagesFolder = recipeFolder.folder('images');

          for (const image of recipe.generalImages) {
            const imageInfo = this.extractImageInfo(image.url);
            if (imageInfo) {
              try {
                const imageId = this.fileResolver.extractImageId(imageInfo.imageName);

                const imageFile = await this.fileResolver.getFileWithFallback(
                  fileStorage,
                  imageId,
                  recipe,
                  imageInfo.relativePath,
                  true
                );

                if (imageFile && imagesFolder) {
                  imagesFolder.file(imageInfo.imageName, imageFile);
                }
              } catch (error) {
                this.logger.warn(`Failed to add general image ${image.url}`, error);
              }
            }
          }
        }

        if (recipe.downloadableExecutables && recipe.downloadableExecutables.length > 0) {
          const executablesFolder = recipeFolder.folder('downloadExecutables');

          for (const executable of recipe.downloadableExecutables) {
            if (executable.filePath) {
              const execInfo = this.extractExecutableInfo(executable.filePath);
              if (execInfo) {
                try {
                  const jsonFile = await this.fileResolver.getFileWithFallback(
                    fileStorage,
                    execInfo.fileName,
                    recipe,
                    execInfo.relativePath,
                    false
                  );

                  if (jsonFile && executablesFolder) {
                    executablesFolder.file(execInfo.fileName, jsonFile);
                  }
                } catch (error) {
                  this.logger.warn(`Failed to add JSON file ${executable.filePath}`, error);
                }
              }
            }
          }
        }

        processedCount++;
      }

      updateProgress('Generating index.json...');
      const indexRecipes = this.generateRecipeIndex(allRecipesForIndex || recipes, recipeActiveStates);
      zip.file('index.json', JSON.stringify({ recipes: indexRecipes }, null, 2));

      updateProgress('Adding deployment instructions...');
      const instructions = this.generateRecipeUpdateInstructions(recipes);
      zip.file('DEPLOYMENT_INSTRUCTIONS.txt', instructions);

      updateProgress('Generating ZIP file...');

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `recipes_export_${timestamp}.zip`;

      this.downloadBlob(zipBlob, filename);

      updateProgress('Export completed!');

      const totalRecipesInIndex = allRecipesForIndex ? allRecipesForIndex.length : recipes.length;
      this.notificationService.success(`${recipes.length} edited recipes exported as ZIP with index.json containing ${totalRecipesInIndex} total recipes`);

    } catch (error) {
      this.logger.error('Error exporting recipes as ZIP', error);
      this.notificationService.error('Failed to export recipes as ZIP');
      throw error; // Re-throw to allow caller to handle cleanup
    }
  }

  async exportAsJSON(recipes: RecipeData[]): Promise<void> {
    try {
      const indexRecipes = this.generateRecipeIndex(recipes);

      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          version: '1.0.0',
          recipeCount: recipes.length,
          format: 'recipe-collection'
        },
        index: { recipes: indexRecipes },
        recipes: recipes
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `recipes_${timestamp}.json`;

      this.downloadBlob(blob, filename);
      this.notificationService.success(`${recipes.length} recipes exported as JSON with index`);
    } catch (error) {
      this.logger.error('Error exporting recipes as JSON', error);
      this.notificationService.error('Failed to export recipes as JSON');
    }
  }

  private generateRecipeIndex(recipes: RecipeData[], recipeActiveStates?: Map<string, boolean>): RecipeIndexEntry[] {
    const validRecipes = recipes.filter(recipe => recipe.id && recipe.title);
    const existingFolders = new Set<string>();

    return validRecipes.map(recipe => {
      const folderId = generateFolderName(recipe.title, existingFolders);
      existingFolders.add(folderId);

      // Use the active state from the map if available, otherwise default to true
      const active = recipeActiveStates?.get(recipe.id) ?? true;

      return {
        folderId: folderId,
        active: active
      };
    }).sort((a, b) => a.folderId.localeCompare(b.folderId));
  }

  private generateRecipeUpdateInstructions(recipes: RecipeData[]): string {
    const timestamp = new Date().toISOString();
    const totalRecipes = recipes.length;
    const categories = [...new Set(recipes.map(r => r.category))];

    const instructions = `
Recipe Export Update Instructions
================================
Export Date: ${timestamp}
Total Recipes: ${totalRecipes}
Categories: ${categories.join(', ')}

How to Deploy the Exported Recipes:
-----------------------------------

1. Recipe Data Structure:
   - index.json: Contains recipe metadata and configuration
   - [recipe-id]/recipe.json: Individual recipe definitions
   - [recipe-id]/images/: Recipe-specific images
   - [recipe-id]/downloadExecutables/: JSON executable files

2. For Production Deployment:
   - Copy index.json to src/assets/recipes/
   - Copy all recipe folders to src/assets/recipes/
   - Ensure the directory structure matches: src/assets/recipes/[recipe-id]/

3. Recipe System Integration:
   - The index.json file is automatically loaded by RecipeService
   - Only recipes marked as "active: true" in index.json will be displayed
   - Category names are normalized to kebab-case for routing

4. Build Process:
   - Run: node src/tools/generate-recipe-components.js
   - This will generate Angular components for each recipe
   - Run: ng build
   - Test: ng serve

5. Validation:
   - All recipes in the index must have corresponding folders
   - Each recipe folder must contain a recipe.json file
   - Image references in recipes must match actual image files

Exported Recipe List:
-------------------
${recipes.map((recipe, index) => `${index + 1}. ${recipe.title} (${recipe.id})`).join('\n')}

Notes:
------
- The index.json format follows RecipeIndexConfig interface requirements
- Recipe IDs are used as folder names and component identifiers
- Image paths use relative references: "images/[filename]"
- All downloadable executables are stored in downloadExecutables/ subdirectory
- Recipe categories are automatically converted to URL-friendly format
`;

    return instructions;
  }


  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
