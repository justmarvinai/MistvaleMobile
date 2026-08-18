// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface RankUpTarget {
  name: string;
  /** Manifest asset id for the portrait. */
  art?: string;
  rarity?: Rarity;
  /** Stars now. */
  stars: number;
  /** Stars after a successful rank-up. */
  nextStars?: number;
  level?: number;
}

export interface RankUpPanelOptions extends BaseOptions {
  target: RankUpTarget;
  /** How many fodder units the rank-up consumes. */
  slots?: number;
  /** Fodder already placed, as manifest asset ids (or empty strings for blanks). */
  fodder?: Array<{ art?: string; rarity?: Rarity; name?: string } | null>;
  /** Success chance, 0–100. Omit for guaranteed systems. */
  chance?: number;
  /** Currency cost of the attempt. */
  cost?: number;
  /** Glyph asset id for the currency. */
  costGlyph?: string;
  /** Label on the commit button. */
  action?: string;
  /** Warn the player that failure consumes the fodder anyway. */
  warning?: string;
}

/**
 * The ascension / star-up screen: the champion being raised, the fodder slots
 * feeding it, the success chance and the cost, with a commit that stays locked
 * until every slot is filled.
 *
 *   const rankup = new RankUpPanel({
 *     target: { name: 'Emberwake', art: 'fire-phoenix-rise', rarity: 'legendary', stars: 4, nextStars: 5 },
 *     slots: 5,
 *     fodder: [{ art: 'rune-crystal-shard' }, null, null, null, null],
 *     chance: 62, cost: 45000, costGlyph: 'glyph-coin-stack',
 *     warning: 'Fodder is consumed even if the ascension fails.',
 *   });
 *   rankup.on('rankup:slot', (i) => openFodderPicker(i));
 *   rankup.on('rankup:confirm', () => attempt());
 *
 * Empty slots emit `rankup:slot` with their index, so the caller opens its own
 * picker rather than this component owning the roster.
 */
export class RankUpPanel extends FuiComponent<RankUpPanelOptions> {
  private slotEls: HTMLElement[] = [];
  private fodder: Array<{ art?: string; rarity?: Rarity; name?: string } | null>;
  private button: HTMLButtonElement | null = null;

  constructor(opts: RankUpPanelOptions) {
    const root = h('div', { class: 'fui fui-rankup' });
    super(root, opts);

    const count = opts.slots ?? 5;
    this.fodder = Array.from({ length: count }, (_, i) => opts.fodder?.[i] ?? null);

    // ── Target ────────────────────────────────────────────────────────────
    const target = h('div', {
      class: 'fui-rankup__target',
      dataset: { rarity: opts.target.rarity ?? 'rare' },
    });
    const art = h('div', { class: 'fui-rankup__art' });
    if (opts.target.art) art.style.backgroundImage = `var(--fui-img-${opts.target.art})`;
    target.appendChild(art);

    const info = h('div', { class: 'fui-rankup__info' });
    info.appendChild(h('span', { class: 'fui-rankup__name fui-title', text: opts.target.name }));
    if (opts.target.level != null) {
      info.appendChild(h('span', { class: 'fui-rankup__level', text: `Level ${opts.target.level}` }));
    }

    const track = h('div', { class: 'fui-rankup__stars' });
    track.appendChild(
      h('span', { class: 'fui-rankup__star-row', text: '★'.repeat(opts.target.stars) }),
    );
    if (opts.target.nextStars != null) {
      track.appendChild(h('span', { class: 'fui-rankup__arrow', text: '→' }));
      track.appendChild(
        h('span', {
          class: 'fui-rankup__star-row is-next',
          text: '★'.repeat(opts.target.nextStars),
        }),
      );
    }
    info.appendChild(track);
    target.appendChild(info);
    root.appendChild(target);

    // ── Fodder ────────────────────────────────────────────────────────────
    root.appendChild(h('p', { class: 'fui-rankup__label fui-label', text: 'Ascension material' }));
    const grid = h('div', { class: 'fui-rankup__slots' });
    for (let i = 0; i < count; i++) {
      const slot = h('button', {
        class: 'fui-rankup__slot',
        attrs: { type: 'button', 'aria-label': `Material slot ${i + 1}` },
      });
      slot.addEventListener('click', () => this.emit('rankup:slot', i));
      this.slotEls.push(slot);
      grid.appendChild(slot);
    }
    root.appendChild(grid);

    // ── Odds and cost ─────────────────────────────────────────────────────
    const foot = h('div', { class: 'fui-rankup__foot' });
    if (opts.chance != null) {
      const chance = clamp(opts.chance, 0, 100);
      const odds = h('div', {
        class: 'fui-rankup__chance',
        dataset: { risk: chance >= 75 ? 'low' : chance >= 40 ? 'mid' : 'high' },
        style: { '--fui-rankup-chance': String(chance / 100) },
      });
      odds.appendChild(h('span', { class: 'fui-rankup__chance-label fui-label', text: 'Success' }));
      odds.appendChild(
        h('span', { class: 'fui-rankup__chance-value fui-num', text: `${Math.round(chance)}%` }),
      );
      odds.appendChild(h('span', { class: 'fui-rankup__chance-bar' }));
      foot.appendChild(odds);
    }
    if (opts.cost != null) {
      const cost = h('div', { class: 'fui-rankup__cost' });
      if (opts.costGlyph) {
        cost.appendChild(
          h('span', {
            class: 'fui-rankup__cost-glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${opts.costGlyph})` },
          }),
        );
      }
      cost.appendChild(h('span', { class: 'fui-num', text: commas(opts.cost) }));
      foot.appendChild(cost);
    }
    root.appendChild(foot);

    if (opts.warning) {
      root.appendChild(h('p', { class: 'fui-rankup__warning', text: opts.warning }));
    }

    this.button = h('button', {
      class: 'fui-rankup__action',
      text: opts.action ?? 'Ascend',
      attrs: { type: 'button' },
    });
    this.button.addEventListener('click', () => {
      if (this.isReady()) this.emit('rankup:confirm', this.fodder);
    });
    root.appendChild(this.button);
    this.paint();
  }

  /** Place (or clear, with `null`) a fodder unit in one slot. */
  setSlot(index: number, unit: { art?: string; rarity?: Rarity; name?: string } | null): this {
    if (index < 0 || index >= this.fodder.length) return this;
    this.fodder[index] = unit;
    this.paint();
    this.emit('rankup:change', this.fodder);
    return this;
  }

  /** True once every slot is filled. */
  isReady(): boolean {
    return this.fodder.every(Boolean);
  }

  private paint(): void {
    this.slotEls.forEach((slot, i) => {
      const unit = this.fodder[i];
      slot.classList.toggle('is-filled', !!unit);
      slot.dataset.rarity = unit?.rarity ?? '';
      slot.title = unit?.name ?? 'Empty';
      slot.style.backgroundImage = unit?.art ? `var(--fui-img-${unit.art})` : '';
    });
    if (this.button) this.button.disabled = !this.isReady();
  }
}
