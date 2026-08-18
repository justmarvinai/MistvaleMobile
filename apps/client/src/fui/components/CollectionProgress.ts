// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity, RARITIES } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface CollectionTier {
  rarity: Rarity;
  /** How many of this rarity are owned. */
  owned: number;
  /** How many exist. */
  total: number;
}

export interface CollectionProgressOptions extends BaseOptions {
  tiers: CollectionTier[];
  /** Heading. Defaults to "Collection". */
  title?: string;
  /** What is being collected — "champions", "artifacts". */
  unit?: string;
  /** Show the overall percentage ring-style headline. */
  showTotal?: boolean;
  /** Milestone rewards keyed by percentage complete. */
  milestones?: Array<{ at: number; label: string; claimed?: boolean }>;
  compact?: boolean;
}

/**
 * "You own 84 of 128" — collection completion split by rarity, which is the
 * only breakdown that actually tells a player what is left to chase.
 *
 *   new CollectionProgress({
 *     title: 'Champions', unit: 'champions', showTotal: true,
 *     tiers: [
 *       { rarity: 'rare', owned: 48, total: 52 },
 *       { rarity: 'epic', owned: 27, total: 44 },
 *       { rarity: 'legendary', owned: 9, total: 32 },
 *     ],
 *     milestones: [{ at: 50, label: '1 Sacred Shard', claimed: true }, { at: 75, label: 'Void Shard' }],
 *   });
 *
 * A single "66%" hides the fact that the last 34% is all legendaries; the
 * per-rarity rows do not.
 */
export class CollectionProgress extends FuiComponent<CollectionProgressOptions> {
  constructor(opts: CollectionProgressOptions) {
    const owned = opts.tiers.reduce((s, t) => s + t.owned, 0);
    const total = opts.tiers.reduce((s, t) => s + t.total, 0) || 1;
    const pct = clamp(owned / total, 0, 1);

    const root = h('div', {
      class: 'fui fui-collection',
      style: { '--fui-coll-p': String(pct) },
    });
    if (opts.compact) root.classList.add('fui-collection--compact');
    super(root, opts);

    const head = h('div', { class: 'fui-collection__head' });
    head.appendChild(
      h('span', { class: 'fui-collection__title fui-label', text: opts.title ?? 'Collection' }),
    );
    if (opts.showTotal ?? true) {
      head.appendChild(
        h('span', {
          class: 'fui-collection__total fui-num',
          text: `${commas(owned)} / ${commas(total)} ${opts.unit ?? ''}`.trim(),
        }),
      );
      head.appendChild(
        h('span', {
          class: 'fui-collection__pct fui-num',
          text: `${Math.round(pct * 100)}%`,
        }),
      );
    }
    root.appendChild(head);

    // Tiers are drawn in the canonical rarity order regardless of input order,
    // so two collections are always comparable at a glance.
    const order = new Map(RARITIES.map((r, i) => [r, i]));
    const tiers = [...opts.tiers].sort(
      (a, b) => (order.get(a.rarity) ?? 0) - (order.get(b.rarity) ?? 0),
    );

    const list = h('div', { class: 'fui-collection__tiers' });
    for (const tier of tiers) {
      const share = tier.total ? clamp(tier.owned / tier.total, 0, 1) : 0;
      const row = h('div', {
        class: 'fui-collection__tier',
        dataset: { rarity: tier.rarity, complete: String(tier.owned >= tier.total) },
        style: { '--fui-coll-t': String(share) },
      });
      row.appendChild(h('span', { class: 'fui-collection__rarity', text: tier.rarity }));
      row.appendChild(h('span', { class: 'fui-collection__bar' }));
      row.appendChild(
        h('span', {
          class: 'fui-collection__count fui-num',
          text: `${commas(tier.owned)}/${commas(tier.total)}`,
        }),
      );
      list.appendChild(row);
    }
    root.appendChild(list);

    if (opts.milestones?.length) {
      const track = h('div', { class: 'fui-collection__milestones' });
      for (const m of [...opts.milestones].sort((a, b) => a.at - b.at)) {
        const reached = pct * 100 >= m.at;
        const pip = h('div', {
          class: 'fui-collection__milestone',
          dataset: {
            state: m.claimed ? 'claimed' : reached ? 'ready' : 'locked',
          },
          style: { left: `${clamp(m.at, 0, 100)}%` },
          attrs: { title: `${m.at}% — ${m.label}` },
        });
        pip.appendChild(h('span', { class: 'fui-collection__milestone-dot' }));
        pip.appendChild(h('span', { class: 'fui-collection__milestone-label', text: m.label }));
        track.appendChild(pip);
      }
      root.appendChild(
        h('div', { class: 'fui-collection__milestone-track' },
          h('span', { class: 'fui-collection__milestone-fill' }),
          track,
        ),
      );
    }
  }
}
