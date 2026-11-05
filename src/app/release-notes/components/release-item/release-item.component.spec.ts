import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { ReleaseBlock, ReleaseItem } from '../../models/release.model';
import { ListBlockComponent } from '../blocks/list-block/list-block.component';
import { ParagraphBlockComponent } from '../blocks/paragraph-block/paragraph-block.component';
import { TableBlockComponent } from '../blocks/table-block/table-block.component';
import { InlineTextComponent } from '../inline-text/inline-text.component';
import { ReleaseItemComponent } from './release-item.component';

describe('ReleaseItemComponent', () => {
  let fixture: ComponentFixture<ReleaseItemComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [
        ReleaseItemComponent,
        InlineTextComponent,
        ParagraphBlockComponent,
        ListBlockComponent,
        TableBlockComponent,
      ],
      imports: [RouterModule.forRoot([])],
    });
    fixture = TestBed.createComponent(ReleaseItemComponent);
    host = fixture.nativeElement;
  });

  function render(item: ReleaseItem): void {
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
  }

  it('shows the title', () => {
    render({ title: 'Something changed', blocks: [] });
    expect(host.querySelector('h4')?.textContent).toBe('Something changed');
  });

  it('renders each block with the component for its type, in order', () => {
    render({
      title: 'Mixed content',
      blocks: [
        { type: 'paragraph', text: 'First.' },
        { type: 'table', columns: ['Old', 'New'], rows: [['a', 'b'], ['c', 'd']] },
        { type: 'list', items: ['one', 'two'] },
        { type: 'list', ordered: true, items: ['step'] },
      ],
    });

    const rendered = Array.from(host.querySelectorAll('.block')).map(block => block.firstElementChild?.tagName.toLowerCase());
    expect(rendered).toEqual([
      'app-release-paragraph-block',
      'app-release-table-block',
      'app-release-list-block',
      'app-release-list-block',
    ]);

    expect(host.querySelector('p')?.textContent).toBe('First.');
    expect(Array.from(host.querySelectorAll('th')).map(cell => cell.textContent)).toEqual(['Old', 'New']);
    expect(Array.from(host.querySelectorAll('td')).map(cell => cell.textContent)).toEqual(['a', 'b', 'c', 'd']);
    expect(host.querySelectorAll('ul li').length).toBe(2);
    expect(host.querySelectorAll('ol li').length).toBe(1);
  });

  it('skips a block type it has no component for, and still renders the rest', () => {
    const unknown = { type: 'video', src: 'demo.mp4' } as unknown as ReleaseBlock;
    render({ title: 'Newer content', blocks: [unknown, { type: 'paragraph', text: 'Still here.' }] });
    expect(host.querySelectorAll('p').length).toBe(1);
    expect(host.querySelector('p')?.textContent).toBe('Still here.');
  });
});
