import { Injectable } from '@angular/core';
import {
  RecipeData,
  StepMedia,
  GeneralImage,
  WalkthroughStep,
  WalkthroughTab,
  isLegacyWalkthrough
} from '../../core/models/recipe.model';
import { FileStorageAdapter } from '../../core/storage';
import { ImageNamingService } from './image-naming.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';

export type ImageUploadPurpose =
  | 'step-media'
  | 'general-image'
  | 'replace-step-media'
  | 'replace-general-image';

export interface ImageUploadOptions {
  // Tab-aware location for step-media uploads (new format)
  tabIndex?: number;
  stepIndex?: number;
  existingObject?: StepMedia | GeneralImage;
  targetInput?: HTMLInputElement;
}

export interface ImageUploadResult {
  success: boolean;
  baseName?: string;
  fullFileName?: string;
  displayUrl?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageManagementService {

  constructor(
    private fileStorageService: FileStorageAdapter,
    private imageNamingService: ImageNamingService,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  async uploadImage(
    file: File,
    recipe: RecipeData,
    purpose: ImageUploadPurpose,
    options: ImageUploadOptions = {},
    changeCallback?: () => void
  ): Promise<ImageUploadResult> {
    const validation = this.fileStorageService.validateImageFile(file);
    if (!validation.valid) {
      this.notificationService.error(validation.error || 'Invalid file');
      return { success: false, error: validation.error };
    }

    try {
      const { baseName, fullFileName } = this.generateImageFileName(
        file,
        recipe,
        purpose,
        options
      );

      await this.fileStorageService.storeImage(baseName, file);

      const displayUrl = URL.createObjectURL(file);

      this.updateRecipeWithImage(
        recipe,
        purpose,
        options,
        baseName,
        fullFileName,
        displayUrl,
        file
      );

      if (options.targetInput) {
        options.targetInput.value = '';
      }

      if (changeCallback) {
        changeCallback();
      }

      this.notificationService.success('Image uploaded successfully');

      return {
        success: true,
        baseName,
        fullFileName,
        displayUrl
      };
    } catch (error) {
      this.logger.error('Error uploading image:', error);
      this.notificationService.error('Failed to upload image');
      return { success: false, error: 'Upload failed' };
    }
  }

  async handleStepImageDrop(
    event: DragEvent,
    recipe: RecipeData,
    tabIndex: number,
    stepIndex: number,
    changeCallback?: () => void
  ): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await this.uploadImage(
        files[i],
        recipe,
        'step-media',
        { tabIndex, stepIndex },
        changeCallback
      );
    }
  }

  async handleGeneralImageDrop(
    event: DragEvent,
    recipe: RecipeData,
    changeCallback?: () => void
  ): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await this.uploadImage(
        files[i],
        recipe,
        'general-image',
        {},
        changeCallback
      );
    }
  }

  addEmptyGeneralImage(recipe: RecipeData, changeCallback?: () => void): void {
    if (!recipe) return;

    const newGeneralImage: GeneralImage = {
      type: 'image',
      url: '',
      alt: ''
    };

    if (!recipe.generalImages) {
      recipe.generalImages = [];
    }

    recipe.generalImages.push(newGeneralImage);

    if (changeCallback) {
      changeCallback();
    }
  }

  private generateImageFileName(
    file: File,
    recipe: RecipeData,
    purpose: ImageUploadPurpose,
    options: ImageUploadOptions
  ): { baseName: string; fullFileName: string } {
    let baseName: string;
    let fullFileName: string;

    if (purpose === 'step-media' || purpose === 'replace-step-media') {
      const step = this.locateStep(recipe, options.tabIndex, options.stepIndex);
      baseName = this.imageNamingService.generateImageName(file, recipe, step);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      fullFileName = `${baseName}.${extension}`;
    } else if (purpose === 'general-image') {
      baseName = this.imageNamingService.generateGeneralImageName(file, recipe);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      fullFileName = `${baseName}.${extension}`;
    } else {
      const imageId = this.fileStorageService.generateImageId();
      const originalName = this.fileStorageService.sanitizeFileName(file.name);
      baseName = imageId;
      fullFileName = `${imageId}_${originalName}`;
    }

    return { baseName, fullFileName };
  }

  private locateStep(
    recipe: RecipeData,
    tabIndex?: number,
    stepIndex?: number
  ): WalkthroughStep | null {
    if (stepIndex === undefined || !recipe.walkthrough) return null;
    if (isLegacyWalkthrough(recipe.walkthrough)) {
      return (recipe.walkthrough as WalkthroughStep[])[stepIndex] || null;
    }
    const tab = (recipe.walkthrough as WalkthroughTab[])[tabIndex ?? 0];
    return tab?.steps?.[stepIndex] || null;
  }

  private updateRecipeWithImage(
    recipe: RecipeData,
    purpose: ImageUploadPurpose,
    options: ImageUploadOptions,
    baseName: string,
    fullFileName: string,
    displayUrl: string,
    file: File
  ): void {
    if (purpose === 'step-media') {
      const media: StepMedia = {
        type: 'image',
        url: `images/${fullFileName}`,
        alt: file.name.replace(/\.[^/.]+$/, '')
      };
      (media as any).displayUrl = displayUrl;
      const step = this.locateStep(recipe, options.tabIndex, options.stepIndex);
      if (step) {
        if (!step.media) step.media = [];
        step.media.push(media);
      }
    } else if (purpose === 'general-image') {
      const generalImage: GeneralImage = {
        type: 'image',
        url: `images/${fullFileName}`,
        alt: file.name.replace(/\.[^/.]+$/, ''),
        imageId: baseName
      };
      (generalImage as any).displayUrl = displayUrl;
      if (!recipe.generalImages) {
        recipe.generalImages = [];
      }
      recipe.generalImages.push(generalImage);
    } else if (purpose === 'replace-step-media' || purpose === 'replace-general-image') {
      options.existingObject!.url = `images/${fullFileName}`;
      (options.existingObject as any).displayUrl = displayUrl;
    }
  }
}
