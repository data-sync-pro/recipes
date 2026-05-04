import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { DownloadableExecutable } from '../../../core/models/recipe.model';
import { TrackByUtil } from '../../../../shared/utils/trackby.util';
import { FileStorageAdapter } from '../../../core/storage';
import { NotificationService } from '../../../../shared/services/notification.service';
import { LoggerService } from '../../../core/services/logger.service';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileUploadComponent {
  @Input() downloadableExecutables: DownloadableExecutable[] = [];
  @Output() downloadableExecutablesChange = new EventEmitter<void>();

  constructor(
    private fileStorageService: FileStorageAdapter,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  onChange(): void {
    this.downloadableExecutablesChange.emit();
  }

  addDownloadableExecutable(): void {
    const newExecutable: DownloadableExecutable = {
      filePath: ''
    };

    this.downloadableExecutables.push(newExecutable);
    this.onChange();
  }

  async removeDownloadableExecutable(index: number): Promise<void> {
    if (!this.downloadableExecutables) return;

    const executable = this.downloadableExecutables[index];

    if (executable.filePath) {
      const fileName = this.getJsonFileName(executable);
      await this.fileStorageService.deleteJsonFile(fileName);
    }

    this.downloadableExecutables.splice(index, 1);
    this.onChange();
  }

  async onJsonFileDrop(event: DragEvent, index: number): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this.handleJsonFileUpload(file, index);
  }

  onJsonFileDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const uploadArea = target.closest('.json-upload-area');
    if (uploadArea) {
      uploadArea.classList.add('drag-over');
    }
  }

  onJsonFileDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const uploadArea = target.closest('.json-upload-area');
    if (uploadArea) {
      uploadArea.classList.remove('drag-over');
    }
  }

  triggerJsonFileInput(index: number): void {
    const fileInput = document.querySelector(`#json-upload-${index}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  async onJsonFileSelect(event: Event, index: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    await this.handleJsonFileUpload(file, index);

    input.value = '';
  }

  getJsonFileName(executable: DownloadableExecutable): string {
    if (!executable.filePath) return '';
    return executable.filePath.replace('downloadExecutables/', '');
  }

  private async handleJsonFileUpload(file: File, index: number): Promise<void> {
    if (!this.downloadableExecutables?.[index]) return;

    const validation = this.fileStorageService.validateJsonFile(file);
    if (!validation.valid) {
      this.notificationService.error(validation.error!);
      return;
    }

    try {
      const jsonContent = await this.readFileAsText(file);
      try {
        JSON.parse(jsonContent);
      } catch (jsonError) {
        this.notificationService.error('Invalid JSON file format');
        return;
      }

      // Keep original filename, just sanitize it (replace spaces with underscores)
      const fileName = this.fileStorageService.sanitizeFileName(file.name);

      await this.fileStorageService.storeJsonFile(fileName, file);

      this.downloadableExecutables[index].filePath = `downloadExecutables/${fileName}`;
      this.onChange();

      this.notificationService.success(`JSON file uploaded: ${fileName}`);
    } catch (error) {
      this.logger.error('Error uploading JSON file:', error);
      this.notificationService.error('Failed to upload JSON file');
    }
  }

  private async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  trackByIndex = TrackByUtil.index;
}
