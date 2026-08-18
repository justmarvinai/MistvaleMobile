// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export interface ItemCardData {
  id?: string;
  icon: string;
  name: string;
  /** Type line, e.g. `'Two-Handed Sword'` or `'Consumable'`. */
  type?: string;
  rarity?: Rarity;
  qty?: number;
  /** Price in gold. Rendered with a coin icon. */
  price?: number;
  /** Short stat summary, e.g. `'+14 Strength'`. */
  detail?: string;
  /** Greys the row and blocks the action — can't afford, level too low. */
  disabled?: boolean;
}

export interface ItemCardOptions extends BaseOptions {
  item: ItemCardData;
  /** Label for the trailing action button. Omit for a display-only row. */
  action?: string;
  /** Compact height for dense lists. */
  dense?: boolean;
  /** Highlight as the current selection. */
  selected?: boolean;
}

/**
 * A horizontal item row: icon, name, type line, price and an optional action.
 * The shared building block behind shop lists, loot windows, crafting
 * ingredient lists and mail attachments.
 *
 * Emits `item:click` and, when `action` is set, `item:action`.
 *
 *   new ItemCard({ item: { icon: 'icon-sword', name: 'Emberfang',
 *     type: 'Longsword', rarity: 'epic', price: 1450 }, action: 'Buy' });
 */
export class ItemCard extends FuiComponent<ItemCardOptions> {
  constructor(opts: ItemCardOptions) {
    const item = opts.item;
    const root = h('div', {
      class: 'fui fui-itemcard',
      dataset: { ...(item.rarity ? { rarity: item.rarity } : {}) },
      attrs: { role: 'listitem' },
    });
    if (opts.dense) root.classList.add('fui-itemcard--dense');
    if (opts.selected) root.classList.add('is-selected');
    if (item.disabled) root.classList.add('is-disabled');
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-itemcard__fill', attrs: { 'aria-hidden': 'true' } }));

    const art = h('div', { class: 'fui-itemcard__art' });
    art.appendChild(
      h('span', {
        class: 'fui-itemcard__icon',
        style: { backgroundImage: `var(--fui-img-${item.icon})` },
      }),
    );
    if (item.qty && item.qty > 1) {
      art.appendChild(h('span', { class: 'fui-itemcard__qty fui-num', text: String(item.qty) }));
    }
    root.appendChild(art);

    const body = h(
      'div',
      { class: 'fui-itemcard__body' },
      h('div', { class: 'fui-itemcard__name', text: item.name }),
      (item.type || item.detail) &&
        h(
          'div',
          { class: 'fui-itemcard__meta' },
          item.type && h('span', { text: item.type }),
          item.detail && h('span', { class: 'fui-itemcard__detail', text: item.detail }),
        ),
    );
    root.appendChild(body);

    if (item.price != null) {
      root.appendChild(
        h(
          'div',
          { class: 'fui-itemcard__price' },
          h('span', { class: 'fui-itemcard__coin', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'fui-num', text: commas(item.price) }),
        ),
      );
    }

    if (opts.action) {
      const btn = h('button', {
        class: 'fui-itemcard__action',
        attrs: { type: 'button', disabled: item.disabled },
        text: opts.action,
      });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.emit('item:action', item);
      });
      root.appendChild(btn);
    }

    root.addEventListener('click', () => this.emit('item:click', item));
  }

  setSelected(selected: boolean): this {
    this.el.classList.toggle('is-selected', selected);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.el.classList.toggle('is-disabled', disabled);
    const btn = this.el.querySelector('button');
    if (btn) (btn as HTMLButtonElement).disabled = disabled;
    return this;
  }
}
