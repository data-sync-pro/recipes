import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-image-uploader',
  templateUrl: './image-uploader.component.html',
  styleUrls: ['./image-uploader.component.css'],
})
export class ImageUploaderComponent {
  @Output() filesSelected = new EventEmitter<File[]>();

  isDragging = false;

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.emit(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    this.emit(Array.from(files).filter((f) => f.type.startsWith('image/')));
  }

  private emit(files: File[]): void {
    if (files.length > 0) this.filesSelected.emit(files);
  }
}
