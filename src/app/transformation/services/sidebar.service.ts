import { Injectable } from '@angular/core';
import  { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  private activeCategorySubject = new BehaviorSubject<string | null>(null);
  activeCategory$ = this.activeCategorySubject.asObservable();

  setActiveCategory(category: string){
    this.activeCategorySubject.next(category);
  }
}
