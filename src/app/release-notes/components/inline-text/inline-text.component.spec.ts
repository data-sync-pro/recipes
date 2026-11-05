import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { RichText } from '../../models/release.model';
import { InlineTextComponent } from './inline-text.component';

describe('InlineTextComponent', () => {
  let fixture: ComponentFixture<InlineTextComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [InlineTextComponent],
      imports: [RouterModule.forRoot([])],
    });
    fixture = TestBed.createComponent(InlineTextComponent);
    host = fixture.nativeElement;
  });

  function render(text: RichText): void {
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
  }

  it('renders a plain string as text only', () => {
    render('Just text.');
    expect(host.textContent).toBe('Just text.');
    expect(host.querySelector('a, strong')).toBeNull();
  });

  it('keeps the spacing between parts', () => {
    render(['See ', { text: 'the manual', href: '/user-manual' }, '.']);
    expect(host.textContent).toBe('See the manual.');
  });

  it('renders a bold span as <strong>', () => {
    render(['An ', { text: 'important', bold: true }, ' change']);
    expect(host.querySelector('strong')?.textContent).toBe('important');
  });

  it('renders a site-relative link as a router link in the same tab', () => {
    render([{ text: 'Data List Settings', href: '/user-manual/data-list-settings#filters' }]);
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/user-manual/data-list-settings#filters');
    expect(link?.hasAttribute('target')).toBeFalse();
    expect(link?.textContent).toBe('Data List Settings');
  });

  it('opens any other link in a new tab', () => {
    render([{ text: 'AppExchange', href: 'https://appexchange.salesforce.com/' }]);
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://appexchange.salesforce.com/');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('supports a link that is also bold', () => {
    render([{ text: 'Read this', bold: true, href: '/faqs' }]);
    expect(host.querySelector('a strong')?.textContent).toBe('Read this');
  });
});
