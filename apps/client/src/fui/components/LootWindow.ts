// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';
import { ItemCard, type ItemCardData } from './ItemCard.ts';

export interface LootWindowOptions extends BaseOptions {
  title?: string;
  /** Source flavour line, e.g. `'Ancient Sarcophagus'`. */
  source?: string;
  items: ItemCardData[];
  gold?: number;
  xp?: number;
  /** Width in pixels. */
  width?: number;
  /** Hero art shown above the list — a chest, a boss portrait. */
  hero?: string;
  /** Label on the take-all button. Default `'Take All'`. */
  takeAllLabel?: string;
}

/**
 * The reward window: what dropped, plus gold and XP, with per-item and
 * take-all actions.
 *
 * Emits `loot:take` with one item, and `loot:takeAll` with everything left.
 *
 *   const loot = new LootWindow({ source: 'Ancient Sarcophagus', gold: 340,
 *     xp: 1200, hero: 'icon-chest', items: [...] });
 */
export class LootWindow extends FuiComponent<LootWindowOptions> {
  private listEl: HTMLElement;
  private items: ItemCardData[];

  constructor(opts: LootWindowOptions) {
    const root = h('div', {
      class: 'fui fui-loot',
      style: { width: `${opts.width ?? 400}px` },
    });
    super(root, opts);
    this.items = [...opts.items];

    root.appendChild(h('div', { class: 'fui-loot__fill', attrs: { 'aria-hidden': 'true' } }));

    if (opts.hero) {
      root.appendChild(
        h('div', {
          class: 'fui-loot__hero',
          style: { backgroundImage: `var(--fui-img-${opts.hero})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    root.appendChild(
      h('h2', { class: 'fui-loot__title fui-title', text: opts.title ?? 'Spoils' }),
    );
    if (opts.source) {
      root.appendChild(h('p', { class: 'fui-loot__source fui-label', text: opts.source }));
    }

    if (opts.gold || opts.xp) {
      const chips = h('div', { class: 'fui-loot__chips' });
      if (opts.gold) {
        chips.appendChild(
          h(
            'span',
            { class: 'fui-loot__chip is-gold' },
            h('span', { class: 'fui-loot__coin', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'fui-num', text: commas(opts.gold) }),
          ),
        );
      }
      if (opts.xp) {
        chips.appendChild(
          h('span', { class: 'fui-loot__chip is-xp' }, h('span', { class: 'fui-num', text: `${commas(opts.xp)} XP` })),
        );
      }
      root.appendChild(chips);
    }

    this.listEl = h('div', { class: 'fui-loot__list fui-scroll', attrs: { role: 'list' } });
    root.appendChild(this.listEl);

    const takeAll = h('button', {
      class: 'fui-loot__takeall',
      attrs: { type: 'button' },
      text: opts.takeAllLabel ?? 'Take All',
    });
    takeAll.addEventListener('click', () => {
      const taken = [...this.items];
      this.items = [];
      this.render();
      this.emit('loot:takeAll', taken);
    });
    root.appendChild(takeAll);

    this.render();
  }

  private render(): void {
    clear(this.listEl);
    if (!this.items.length) {
      this.listEl.appendChild(h('p', { class: 'fui-loot__empty fui-body', text: 'Emptied.' }));
      return;
    }
    for (const item of this.items) {
      const card = new ItemCard({ item, action: 'Take', dense: true });
      card.on<ItemCardData>('item:action', (data) => this.take(data));
      this.listEl.appendChild(card.el);
    }
  }

  /** Remove one item from the window and emit it. */
  take(item: ItemCardData): this {
    this.items = this.items.filter((i) => i !== item && (!!i.id ? i.id !== item.id : true));
    this.render();
    this.emit('loot:take', item);
    return this;
  }

  /** Items still waiting to be collected. */
  get remaining(): ItemCardData[] {
    return [...this.items];
  }
}
