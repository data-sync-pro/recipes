import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { StepMedia, GeneralImage } from '../../../core/models/recipe.model';
import { TrackByUtil } from '../../../core/utils/trackby.util';
import { getFileExtension } from '../../../core/utils';
import { FileStorageAdapter } from '../../../core/storage';
import { ImageNamingService } from '../../services/image-naming.service';
import { ImageLoaderService } from '../../services/image-loader.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { LoggerService } from '../../../core/services/logger.service';

@Component({
  selector: 'app-image-manager',
  templateUrl: './image-manager.component.html',
  styleUrls: ['./image-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageManagerComponent implements OnChanges, AfterViewInit {
  private _media: StepMedia[] = [];
  private _generalImages: GeneralImage[] = [];

  @Input()
  set media(value: StepMedia[]) {
    this._media = value;
    if (this.isInitialized) {
      this.loadAllMediaImages();
    }
  }
  get media(): StepMedia[] {
    return this._media;
  }

  @Input()
  set generalImages(value: GeneralImage[]) {
    this._generalImages = value;
    if (this.isInitialized) {
      this.loadAllGeneralImages();
    }
  }
  get generalImages(): GeneralImage[] {
    return this._generalImages;
  }

  @Input() stepIndex: number = -1;
  @Input() recipeId: string = '';
  @Input() recipeCategory: string = '';

  @Output() mediaChange = new EventEmitter<void>();
  @Output() generalImagesChange = new EventEmitter<void>();

  private isInitialized = false;

  constructor(
    private fileStorageService: FileStorageAdapter,
    private imageNamingService: ImageNamingService,
    private imageLoaderService: ImageLoaderService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    this.isInitialized = true;
    // Defer image loading one tick so view bindings have settled. The async
    // loaders return promises; surface failures via the logger instead of
    // letting them become unhandled rejections.
    setTimeout(() => {
      this.loadAllMediaImages().catch((err) =>
        this.logger.error('Failed to load media images', err)
      );
      this.loadAllGeneralImages().catch((err) =>
        this.logger.error('Failed to load general images', err)
      );
    }, 0);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // OnChanges is kept for compatibility but actual loading happens in setters
    if (!this.isInitialized) {
      return;
    }

    // Load media images when media input changes
    if (changes['media'] && changes['media'].currentValue !== changes['media'].previousValue) {
      await this.loadAllMediaImages();
    }

    // Load general images when generalImages input changes
    if (changes['generalImages'] && changes['generalImages'].currentValue !== changes['generalImages'].previousValue) {
      await this.loadAllGeneralImages();
    }
  }

  private async loadAllMediaImages(): Promise<void> {
    if (!this._media || this._media.length === 0) {
      return;
    }

    this.logger.debug(`Loading ${this._media.length} media images for step ${this.stepIndex}`);

    for (const mediaItem of this._media) {
      if (mediaItem.url && !this.imageLoaderService.hasDisplayUrl(mediaItem)) {
        this.logger.debug(`Loading media image: ${mediaItem.url}`);
        const result = await this.imageLoaderService.loadImageForMedia(mediaItem);
        if (result.success) {
          this.logger.debug(`Successfully loaded media image: ${mediaItem.url}, displayUrl: ${result.displayUrl}`);
        } else {
          this.logger.warn(`Failed to load media image: ${mediaItem.url}`, result.error);
        }
      } else if (this.imageLoaderService.hasDisplayUrl(mediaItem)) {
        this.logger.debug(`Media image already has displayUrl: ${mediaItem.url}`);
      }
    }
    this.cdr.markForCheck();
  }

  private async loadAllGeneralImages(): Promise<void> {
    if (!this._generalImages || this._generalImages.length === 0) {
      return;
    }

    this.logger.debug(`Loading ${this._generalImages.length} general images`);

    for (const image of this._generalImages) {
      if (image.url && !this.imageLoaderService.hasDisplayUrl(image)) {
        this.logger.debug(`Loading general image: ${image.url}`);
        const result = await this.imageLoaderService.loadImageForGeneralImage(image);
        if (result.success) {
          this.logger.debug(`Successfully loaded general image: ${image.url}, displayUrl: ${result.displayUrl}`);
        } else {
          this.logger.warn(`Failed to load general image: ${image.url}`, result.error);
        }
      } else if (this.imageLoaderService.hasDisplayUrl(image)) {
        this.logger.debug(`General image already has displayUrl: ${image.url}`);
      }
    }
    this.cdr.markForCheck();
  }

  addMedia(): void {
    const newMedia: StepMedia = {
      type: 'image',
      url: '',
      alt: ''
    };

    if (!this.media) {
      this.media = [];
    }

    this.media.push(newMedia);
    this.mediaChange.emit();
  }

  async removeMedia(mediaIndex: number): Promise<void> {
    if (!this.media) return;

    const media = this.media[mediaIndex];

    if (media.url && media.url.startsWith('images/')) {
      const baseName = this.imageNamingService.extractBaseNameFromUrl(media.url);
      await this.fileStorageService.deleteImage(baseName);
    }

    this.media.splice(mediaIndex, 1);
    this.mediaChange.emit();
  }

  async onImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this.handleImageUpload(file);
  }

  async handleImageFile(file: File): Promise<void> {
    if (!file) return;
    await this.handleImageUpload(file);
  }

  addGeneralImage(): void {
    const newImage: GeneralImage = {
      type: 'image',
      url: '',
      alt: ''
    };

    if (!this.generalImages) {
      this.generalImages = [];
    }

    this.generalImages.push(newImage);
    this.generalImagesChange.emit();
  }

  async removeGeneralImage(imageIndex: number): Promise<void> {
    if (!this.generalImages) return;

    const image = this.generalImages[imageIndex];

    if (image.imageId) {
      await this.fileStorageService.deleteImage(image.imageId);
    }

    this.generalImages.splice(imageIndex, 1);
    this.generalImagesChange.emit();

    this.notificationService.success('General image removed');
  }

  async onGeneralImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this.handleGeneralImageUpload(file);
  }

  async handleGeneralImageFile(file: File): Promise<void> {
    if (!file) return;
    await this.handleGeneralImageUpload(file);
  }

  private async handleImageUpload(file: File): Promise<void> {

    const validation = this.fileStorageService.validateImageFile(file);
    if (!validation.valid) {
      this.notificationService.error(validation.error!);
      return;
    }

    try {

      const baseName = `step-${this.stepIndex}-image-${Date.now()}`;
      const extension = getFileExtension(file);

      await this.fileStorageService.storeImage(baseName, file);

      const media: StepMedia = {
        type: 'image',
        url: `images/${baseName}.${extension}`,
        alt: file.name.replace(/\.[^/.]+$/, '')
      };

      await this.imageLoaderService.loadImageForMedia(media);

      this.media.push(media);
      this.mediaChange.emit();

      this.notificationService.success(`Image uploaded: ${baseName}.${extension}`);

      this.cdr.detectChanges();
    } catch (error) {
      this.logger.error('Error uploading image:', error);
      this.notificationService.error('Failed to upload image');
    }
  }

  private async handleGeneralImageUpload(file: File): Promise<void> {

    const validation = this.fileStorageService.validateImageFile(file);
    if (!validation.valid) {
      this.notificationService.error(validation.error!);
      return;
    }

    try {

      const baseName = `general-image-${Date.now()}`;
      const extension = getFileExtension(file);

      await this.fileStorageService.storeImage(baseName, file);

      const generalImage: GeneralImage = {
        type: 'image',
        url: `images/${baseName}.${extension}`,
        alt: file.name.replace(/\.[^/.]+$/, ''),
        imageId: baseName
      };

      await this.imageLoaderService.loadImageForGeneralImage(generalImage);

      this.generalImages.push(generalImage);
      this.generalImagesChange.emit();

      this.notificationService.success(`General image added: ${baseName}.${extension}`);

      this.cdr.detectChanges();
    } catch (error) {
      this.logger.error('Error uploading general image:', error);
      this.notificationService.error('Failed to upload general image');
    }
  }

  getDisplayUrl(media: StepMedia | GeneralImage): string | undefined {
    return this.imageLoaderService.getDisplayUrl(media);
  }

  hasDisplayUrl(media: StepMedia | GeneralImage): boolean {
    return this.imageLoaderService.hasDisplayUrl(media);
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    this.logger.warn('Failed to load image:', img.src);
  }

  trackByIndex = TrackByUtil.index;

  onChange(): void {
    if (this.stepIndex >= 0) {
      this.mediaChange.emit();
    } else {
      this.generalImagesChange.emit();
    }
  }
}
