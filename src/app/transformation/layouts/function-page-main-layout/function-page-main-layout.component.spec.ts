import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FunctionPageMainLayoutComponent } from './function-page-main-layout.component';

describe('FunctionPageMainLayoutComponent', () => {
  let component: FunctionPageMainLayoutComponent;
  let fixture: ComponentFixture<FunctionPageMainLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FunctionPageMainLayoutComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FunctionPageMainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
