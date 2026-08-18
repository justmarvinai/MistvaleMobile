// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';

export interface AccordionSection {
  /** Stable id emitted on toggle. Defaults to the title. */
  id?: string;
  title: string;
  /** Glyph asset id drawn before the title. */
  glyph?: string;
  /** Small text on the right of the header — a count, a status. */
  meta?: string;
  content: Child | Child[];
  open?: boolean;
}

export interface AccordionOptions extends BaseOptions {
  sections: AccordionSection[];
  /** Allow several sections open at once. Off by default. */
  multi?: boolean;
}

/**
 * Collapsible sections — settings groups, a quest's objective list, a boss's
 * mechanics breakdown, the FAQ on an event page.
 *
 *   new Accordion({
 *     sections: [
 *       { title: 'Graphics', content: graphicsRows, open: true },
 *       { title: 'Audio', content: audioRows },
 *     ],
 *   });
 *
 * Heights animate through `grid-template-rows`, which means the panel opens
 * smoothly without anyone measuring the content first.
 */
export class Accordion extends FuiComponent<AccordionOptions> {
  private items: Array<{ id: string; root: HTMLElement; head: HTMLButtonElement }> = [];

  constructor(opts: AccordionOptions) {
    const root = h('div', { class: 'fui fui-accordion' });
    super(root, opts);

    opts.sections.forEach((section, i) => {
      const id = section.id ?? section.title;
      const item = h('div', { class: 'fui-accordion__item' });
      const head = h('button', {
        class: 'fui-accordion__head',
        attrs: { type: 'button', 'aria-expanded': String(!!section.open) },
      });

      if (section.glyph) {
        head.appendChild(
          h('span', {
            class: 'fui-accordion__glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${section.glyph})` },
          }),
        );
      }
      head.appendChild(h('span', { class: 'fui-accordion__title', text: section.title }));
      if (section.meta) {
        head.appendChild(h('span', { class: 'fui-accordion__meta', text: section.meta }));
      }
      head.appendChild(h('span', { class: 'fui-accordion__caret', attrs: { 'aria-hidden': 'true' } }));

      const pad = h('div', { class: 'fui-accordion__pad' });
      append(pad, ...(Array.isArray(section.content) ? section.content : [section.content]));
      const body = h(
        'div',
        { class: 'fui-accordion__body' },
        h('div', { class: 'fui-accordion__inner' }, pad),
      );

      head.addEventListener('click', () => this.toggle(id));
      append(item, head, body);
      root.appendChild(item);

      item.classList.toggle('is-open', !!section.open);
      this.items.push({ id, root: item, head });
      void i;
    });
  }

  /** Open a section, closing its siblings unless `multi` is set. */
  open(id: string): this {
    for (const item of this.items) {
      const on = item.id === id;
      if (on || !this.opts.multi) this.setOpen(item, on ? true : false);
    }
    this.emit('accordion:open', id);
    return this;
  }

  toggle(id: string): this {
    const target = this.items.find((i) => i.id === id);
    if (!target) return this;
    const next = !target.root.classList.contains('is-open');
    if (next && !this.opts.multi) {
      for (const item of this.items) if (item !== target) this.setOpen(item, false);
    }
    this.setOpen(target, next);
    this.emit(next ? 'accordion:open' : 'accordion:close', id);
    return this;
  }

  /** Ids of every currently open section. */
  openIds(): string[] {
    return this.items.filter((i) => i.root.classList.contains('is-open')).map((i) => i.id);
  }

  private setOpen(item: { root: HTMLElement; head: HTMLButtonElement }, on: boolean): void {
    item.root.classList.toggle('is-open', on);
    item.head.setAttribute('aria-expanded', String(on));
  }
}
