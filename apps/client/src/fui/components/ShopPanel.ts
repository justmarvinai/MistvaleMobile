// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';
import { ItemCard, type ItemCardData } from './ItemCard.ts';
import { Tabs } from './Tabs.ts';

export interface ShopCategory {
  id: string;
  label: string;
  icon?: string;
  items: ItemCardData[];
}

export interface ShopPanelOptions extends BaseOptions {
  title?: string;
  /** Merchant's name, shown under the title. */
  merchant?: string;
  categories: ShopCategory[];
  /** The player's purse; items above it grey out automatically. */
  gold?: number;
  /** Button label on each row. Default `'Buy'`. */
  action?: string;
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
}

/**
 * The merchant window: category tabs, a scrolling stock list with prices, and
 * a live purse readout that greys out anything you can't afford.
 *
 * Emits `shop:buy` with the item, and `shop:select` on row clicks.
 *
 *   const shop = new ShopPanel({ merchant: 'Bram the Smith', gold: 1200,
 *     categories: [{ id: 'weapons', label: 'Weapons', items: [...] }] });
 *   shop.on('shop:buy', item => purchase(item));
 */
export class ShopPanel extends FuiComponent<ShopPanelOptions> {
  private listEl: HTMLElement;
  private goldEl: HTMLElement;
  private gold: number;
  private activeCategory: string;

  constructor(opts: ShopPanelOptions) {
    const root = h('div', {
      class: 'fui fui-shop',
      style: {
        width: `${opts.width ?? 520}px`,
        ...(opts.height ? { height: `${opts.height}px` } : {}),
      },
    });
    super(root, opts);

    this.gold = opts.gold ?? Infinity;
    this.activeCategory = opts.categories[0]?.id ?? '';

    root.appendChild(h('div', { class: 'fui-shop__fill', attrs: { 'aria-hidden': 'true' } }));

    const head = h('header', { class: 'fui-shop__head' });
    head.appendChild(
      h(
        'div',
        null,
        h('h2', { class: 'fui-shop__title fui-title', text: opts.title ?? 'Merchant' }),
        opts.merchant && h('p', { class: 'fui-shop__merchant fui-label', text: opts.merchant }),
      ),
    );
    this.goldEl = h('span', { class: 'fui-shop__gold fui-num' });
    head.appendChild(
      h(
        'div',
        { class: 'fui-shop__purse' },
        h('span', { class: 'fui-shop__coin', attrs: { 'aria-hidden': 'true' } }),
        this.goldEl,
      ),
    );
    root.appendChild(head);

    if (opts.categories.length > 1) {
      const tabs = new Tabs({
        items: opts.categories.map((c) => ({
          id: c.id,
          label: c.label,
          icon: c.icon,
          count: c.items.length,
        })),
        class: 'fui-shop__tabs',
      });
      tabs.on<{ id: string }>('tabs:change', ({ id }) => {
        this.activeCategory = id;
        this.renderList();
      });
      root.appendChild(tabs.el);
    }

    this.listEl = h('div', { class: 'fui-shop__list fui-scroll', attrs: { role: 'list' } });
    root.appendChild(this.listEl);

    this.setGold(this.gold);
    this.renderList();
  }

  /** Update the purse; rows re-evaluate affordability. */
  setGold(gold: number): this {
    this.gold = gold;
    this.goldEl.textContent = Number.isFinite(gold) ? commas(gold) : '—';
    this.renderList();
    return this;
  }

  /** Replace a category's stock, e.g. after a purchase depletes it. */
  setItems(categoryId: string, items: ItemCardData[]): this {
    const cat = this.opts.categories.find((c) => c.id === categoryId);
    if (cat) cat.items = items;
    this.renderList();
    return this;
  }

  private renderList(): void {
    clear(this.listEl);
    const cat = this.opts.categories.find((c) => c.id === this.activeCategory);
    if (!cat) return;

    if (!cat.items.length) {
      this.listEl.appendChild(
        h('p', { class: 'fui-shop__empty fui-body', text: 'Nothing in stock right now.' }),
      );
      return;
    }

    for (const item of cat.items) {
      const tooDear = item.price != null && item.price > this.gold;
      const card = new ItemCard({
        item: { ...item, disabled: item.disabled || tooDear },
        action: this.opts.action ?? 'Buy',
      });
      card.on<ItemCardData>('item:action', (data) => this.emit('shop:buy', data));
      card.on<ItemCardData>('item:click', (data) => this.emit('shop:select', data));
      this.listEl.appendChild(card.el);
    }
  }
}
