import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly _collapsed$ = new BehaviorSubject<boolean>(false);

  collapsed$ = this._collapsed$.asObservable();

  toggle(): void {
    this._collapsed$.next(!this._collapsed$.value);
  }

  setCollapsed(v: boolean): void {
    this._collapsed$.next(v);
  }
}
