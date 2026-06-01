import {
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  Optional,
  Self,
} from '@angular/core';
import { NgControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

/**
 * Auto-sizes a <textarea> to fit its content, capped at max-height.
 * Works with [(ngModel)]-driven external value changes (e.g., switching
 * functions in the editor) by subscribing to the host control's valueChanges.
 *
 * Usage: <textarea appAutosize="320" ...> — value is the max height in px.
 */
@Directive({
  selector: 'textarea[appAutosize]',
})
export class AutosizeDirective implements OnInit, OnDestroy {
  @Input() appAutosize: number | string | '' = 320;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private el: ElementRef<HTMLTextAreaElement>,
    @Self() @Optional() private control: NgControl | null
  ) {}

  ngOnInit(): void {
    const ta = this.el.nativeElement;
    ta.addEventListener('input', this.adjust);

    // External ngModel updates (selecting a different function reuses the
    // same textarea instance with a new value) — fire adjust once the new
    // value has been written into the DOM.
    if (this.control?.valueChanges) {
      this.control.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => queueMicrotask(this.adjust));
    }

    queueMicrotask(this.adjust);
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('input', this.adjust);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private get maxHeightPx(): number {
    if (this.appAutosize === '' || this.appAutosize == null) return 320;
    const n = typeof this.appAutosize === 'string'
      ? parseInt(this.appAutosize, 10)
      : this.appAutosize;
    return Number.isFinite(n) && n > 0 ? n : 320;
  }

  private readonly adjust = (): void => {
    const ta = this.el.nativeElement;
    // Reset before measuring so shrinking content also shrinks the box.
    ta.style.height = 'auto';
    const max = this.maxHeightPx;
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  };
}
