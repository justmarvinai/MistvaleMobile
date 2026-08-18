// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface TabItem {
  id: string;
  label: string;
  /** Asset id for a leading icon. */
  icon?: string;
  /** Count pip on the right, e.g. unread quests. */
  count?: number;
  disabled?: boolean;
}

export interface TabsOptions extends BaseOptions {
  items: TabItem[];
  /** Id of the initially selected tab. Defaults to the first enabled one. */
  active?: string;
  /** Horizontal strip (default) or a vertical rail down the side. */
  orientation?: 'horizontal' | 'vertical';
  /** Stretch tabs to fill the available width. */
  stretch?: boolean;
}

/**
 * Tab strip for inventory categories, settings sections, shop departments.
 * Emits `tabs:change` with `{ id, index }`.
 *
 *   const tabs = new Tabs({ items: [{ id: 'gear', label: 'Gear' }, ...] });
 *   tabs.on<{ id: string }>('tabs:change', ({ id }) => showPage(id));
 */
export class Tabs extends FuiComponent<TabsOptions> {
  private buttons = new Map<string, HTMLButtonElement>();
  private activeId = '';

  constructor(opts: TabsOptions) {
    const root = h('div', {
      class: 'fui fui-tabs',
      dataset: { orientation: opts.orientation ?? 'horizontal' },
      attrs: { role: 'tablist' },
    });
    if (opts.stretch) root.classList.add('fui-tabs--stretch');
    super(root, opts);

    for (const item of opts.items) {
      const btn = h('button', {
        class: 'fui-tabs__tab',
        attrs: {
          type: 'button',
          role: 'tab',
          disabled: item.disabled,
          'aria-selected': 'false',
        },
        dataset: { id: item.id },
      });
      btn.appendChild(h('span', { class: 'fui-tabs__art', attrs: { 'aria-hidden': 'true' } }));
      if (item.icon) {
        btn.appendChild(
          h('span', {
            class: 'fui-tabs__icon',
            style: { backgroundImage: `var(--fui-img-${item.icon})` },
            attrs: { 'aria-hidden': 'true' },
          }),
        );
      }
      btn.appendChild(h('span', { class: 'fui-tabs__label', text: item.label }));
      if (item.count != null) {
        btn.appendChild(h('span', { class: 'fui-tabs__count fui-num', text: String(item.count) }));
      }
      btn.addEventListener('click', () => this.select(item.id));
      this.buttons.set(item.id, btn);
      root.appendChild(btn);
    }

    const first = opts.active ?? opts.items.find((i) => !i.disabled)?.id;
    if (first) this.select(first, { silent: true });
  }

  /** Currently selected tab id. */
  get active(): string {
    return this.activeId;
  }

  select(id: string, o?: { silent?: boolean }): this {
    if (!this.buttons.has(id)) return this;
    this.activeId = id;
    for (const [key, btn] of this.buttons) {
      const on = key === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    if (!o?.silent) {
      this.emit('tabs:change', {
        id,
        index: this.opts.items.findIndex((i) => i.id === id),
      });
    }
    return this;
  }

  setCount(id: string, n: number): this {
    const pip = this.buttons.get(id)?.querySelector('.fui-tabs__count');
    if (pip) pip.textContent = String(n);
    return this;
  }
}
