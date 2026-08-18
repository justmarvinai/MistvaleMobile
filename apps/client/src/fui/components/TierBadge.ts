// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export type TierName =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'legend';

export const TIERS: TierName[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'legend',
];

export interface TierBadgeOptions extends BaseOptions {
  tier?: TierName;
  /** Roman-numeral division within the tier, 1–5. Omit for undivided tiers. */
  division?: number;
  /** Rating points shown under the badge. */
  points?: number;
  /** Ladder position, shown as `#12`. */
  rank?: number;
  /** Size in pixels. */
  size?: number;
  /** Hide the tier name and show the emblem alone. */
  compact?: boolean;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/**
 * The arena / ladder rank emblem: tier metal, division numeral and rating.
 *
 *   new TierBadge({ tier: 'diamond', division: 2, points: 2588, rank: 41 });
 */
export class TierBadge extends FuiComponent<TierBadgeOptions> {
  constructor(opts: TierBadgeOptions = {}) {
    const tier = opts.tier ?? 'bronze';
    const size = opts.size ?? 72;

    const root = h('div', {
      class: 'fui fui-tier',
      dataset: { tier },
      style: { '--fui-tier-size': `${size}px` },
      attrs: {
        'aria-label': `${tier}${opts.division ? ` ${ROMAN[opts.division] ?? opts.division}` : ''}`,
      },
    });
    if (opts.compact) root.classList.add('fui-tier--compact');
    super(root, opts);

    const emblem = h('div', { class: 'fui-tier__emblem' });
    emblem.appendChild(h('span', { class: 'fui-tier__ring', attrs: { 'aria-hidden': 'true' } }));
    emblem.appendChild(h('span', { class: 'fui-tier__crest', attrs: { 'aria-hidden': 'true' } }));
    if (opts.division) {
      emblem.appendChild(h('span', { class: 'fui-tier__division', text: ROMAN[opts.division] ?? String(opts.division) }));
    }
    root.appendChild(emblem);

    if (!opts.compact) {
      const meta = h('div', { class: 'fui-tier__meta' });
      meta.appendChild(h('span', { class: 'fui-tier__name', text: tier }));
      if (opts.points != null) {
        meta.appendChild(h('span', { class: 'fui-tier__points fui-num', text: `${commas(opts.points)} pts` }));
      }
      if (opts.rank != null) {
        meta.appendChild(h('span', { class: 'fui-tier__rank fui-num', text: `#${commas(opts.rank)}` }));
      }
      root.appendChild(meta);
    }
  }

  setTier(tier: TierName, division?: number): this {
    this.el.dataset.tier = tier;
    const name = this.el.querySelector('.fui-tier__name');
    if (name) name.textContent = tier;
    const div = this.el.querySelector('.fui-tier__division');
    if (div && division) div.textContent = ROMAN[division] ?? String(division);
    return this;
  }
}
