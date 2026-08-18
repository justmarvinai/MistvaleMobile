// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, abbreviate, commas } from '../core/dom.ts';

export interface RewardItem {
  /** Manifest asset id for the reward art. */
  art?: string;
  /** Glyph asset id, when the reward is a currency rather than an item. */
  glyph?: string;
  name?: string;
  qty?: number;
  rarity?: Rarity;
  /** Ribbon on the tile — "NEW", "×2". */
  tag?: string;
}

export interface RewardPopupOptions extends BaseOptions {
  /** Heading — "Stage cleared", "Daily login", "Quest complete". */
  title: string;
  /** Line under the heading. */
  subtitle?: string;
  items: RewardItem[];
  /** Label on the claim button. */
  action?: string;
  /** Render the dimmed backdrop behind the card. */
  backdrop?: boolean;
  /** Tiles pop in one after another rather than all at once. */
  stagger?: boolean;
  /** Columns in the reward grid. */
  columns?: number;
}

/**
 * The reward grid that pops after anything good happens — a stage clear, a
 * daily login, a completed quest, a chest.
 *
 *   const rewards = new RewardPopup({
 *     title: 'Stage Cleared',
 *     subtitle: 'Fire Keep 12 · Brutal',
 *     items: [
 *       { art: 'rune-crystal-shard', name: 'Void Shard', qty: 1, rarity: 'legendary', tag: 'NEW' },
 *       { glyph: 'glyph-coin-stack', name: 'Gold', qty: 120_000 },
 *     ],
 *     stagger: true, backdrop: true, mount: document.body,
 *   });
 *   rewards.on('reward:claim', () => rewards.destroy());
 *
 * `stagger` is what makes a ten-item drop feel like ten things instead of one
 * table appearing.
 */
export class RewardPopup extends FuiComponent<RewardPopupOptions> {
  constructor(opts: RewardPopupOptions) {
    const root = h('div', { class: 'fui fui-reward' });
    if (opts.backdrop) root.classList.add('fui-reward--backdrop');
    super(root, opts);

    const card = h('div', {
      class: 'fui-reward__card',
      style: { '--fui-reward-cols': String(opts.columns ?? Math.min(4, opts.items.length)) },
      attrs: { role: 'dialog', 'aria-label': opts.title },
    });

    card.appendChild(h('p', { class: 'fui-reward__title fui-title', text: opts.title }));
    if (opts.subtitle) {
      card.appendChild(h('p', { class: 'fui-reward__subtitle', text: opts.subtitle }));
    }

    const grid = h('div', { class: 'fui-reward__grid' });
    opts.items.forEach((item, i) => {
      const tile = h('div', {
        class: 'fui-reward__item',
        dataset: { rarity: item.rarity ?? 'common' },
        // Each tile's entry is offset by its index, so the drop reads as a
        // sequence rather than one block appearing.
        style: opts.stagger ? { animationDelay: `${i * 70}ms` } : {},
      });
      if (opts.stagger) tile.classList.add('is-staggered');

      const art = h('span', { class: 'fui-reward__art' });
      if (item.art) art.style.backgroundImage = `var(--fui-img-${item.art})`;
      else if (item.glyph) {
        art.classList.add('is-glyph');
        art.style.setProperty('--fui-glyph-src', `var(--fui-img-${item.glyph})`);
      }
      tile.appendChild(art);

      if (item.qty != null && item.qty > 1) {
        // A six-figure gold payout would run off an 84px tile, so the badge is
        // abbreviated and the exact figure moves to the tooltip.
        tile.title = `${item.name ?? ''} ×${commas(item.qty)}`.trim();
        tile.appendChild(
          h('span', { class: 'fui-reward__qty fui-num', text: `×${abbreviate(item.qty)}` }),
        );
      }
      if (item.tag) tile.appendChild(h('span', { class: 'fui-reward__tag', text: item.tag }));
      if (item.name) tile.appendChild(h('span', { class: 'fui-reward__name', text: item.name }));
      grid.appendChild(tile);
    });
    card.appendChild(grid);

    const btn = h('button', {
      class: 'fui-reward__action',
      text: opts.action ?? 'Claim',
      attrs: { type: 'button' },
    });
    btn.addEventListener('click', () => this.emit('reward:claim', opts.items));
    card.appendChild(btn);

    root.appendChild(card);
  }
}
