import { Injectable } from '@angular/core';
import { StepMedia, GeneralImage } from '../../core/models/recipe.model';
import { LoggerService } from '../../core/services/logger.service';
import { FileStorageAdapter } from '../../core/storage';

interface ImageLoadResult {
  success: boolean;
  displayUrl?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageLoaderService {
  private activeBlobUrls = new Set<string>();

  constructor(
    private logger: LoggerService,
    private fileStorageService: FileStorageAdapter
  ) {
    this.logger.debug('ImageLoaderService initialized');
  }

  async loadImageForMedia(media: StepMedia): Promise<ImageLoadResult> {
    return this.loadImageInternal(media, 'media');
  }

  async loadImageForGeneralImage(image: GeneralImage): Promise<ImageLoadResult> {
    return this.loadImageInternal(image, 'general');
  }

  private async loadImageInternal(
    imageObject: StepMedia | GeneralImage,
    imageType: 'media' | 'general'
  ): Promise<ImageLoadResult> {
    try {
      if (!imageObject.url) {
        return { success: false, error: 'No image URL provided' };
      }

      if (this.isAssetsImage(imageObject.url)) {
        const assetsUrl = this.normalizeAssetsImageUrl(imageObject.url);
        this.logger.debug(`Loading assets ${imageType} image: ${assetsUrl}`);

        (imageObject as any).displayUrl = assetsUrl;
        return { success: true, displayUrl: assetsUrl };
      }

      if (this.isIndexedDBImage(imageObject.url)) {
        const imageKey = this.extractImageKey(imageObject.url);
        this.logger.debug(`Loading ${imageType} image with key: ${imageKey}`);

        const imageFile = await this.fileStorageService.getImage(imageKey);

        if (imageFile) {
          const displayUrl = this.createBlobUrl(imageFile);
          (imageObject as any).displayUrl = displayUrl;
          this.logger.debug(`Successfully loaded ${imageType} image: ${displayUrl}`);
          return { success: true, displayUrl };
        } else {
          this.logger.warn(`No image file found for ${imageType} key: ${imageKey}`);
          return { success: false, error: 'Image not found in storage' };
        }
      }

      return { success: false, error: 'Unsupported image URL format' };
    } catch (error) {
      this.logger.error(`Error loading image for ${imageType}:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private createBlobUrl(file: File): string {
    const url = URL.createObjectURL(file);
    this.activeBlobUrls.add(url);
    return url;
  }

  private isIndexedDBImage(url: string): boolean {
    return url.startsWith('images/');
  }

  private isAssetsImage(url: string): boolean {
    if (url.startsWith('assets/')) {
      return true;
    }

    const relativePath = url.match(/^images\/recipe\/([a-zA-Z0-9_-]+)\//);
    return !!relativePath;
  }

  private normalizeAssetsImageUrl(url: string): string {
    if (url.startsWith('assets/')) {
      return url;
    }

    const match = url.match(/^images\/recipe\/([a-zA-Z0-9_-]+)\/(.+)$/);
    if (match) {
      const folderId = match[1];
      const fileName = match[2];
      return `assets/recipes/${folderId}/${fileName}`;
    }

    return url;
  }

  private extractImageKey(url: string): string {
    if (!url) return '';

    const fileName = url.replace('images/', '');
    const imageKey = fileName.replace(/\.[^/.]+$/, '');

    return imageKey;
  }

  hasDisplayUrl(media: StepMedia | GeneralImage): boolean {
    return !!(media as any).displayUrl;
  }

  getDisplayUrl(media: StepMedia | GeneralImage): string | undefined {
    return (media as any).displayUrl;
  }
}
