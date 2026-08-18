// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';
import { StarRating } from './StarRating.ts';
import { AffinityBadge, AFFINITIES } from './AffinityBadge.ts';

export interface ChampionCardOptions extends BaseOptions {
  name?: string;
  /** Portrait image URL. */
  portrait?: string;
  /** Or a manifest asset id, e.g. any icon from the spell collection. */
  art?: string;
  rarity?: Rarity;
  /** Star rating, the primary power tier in most collection games. */
  stars?: number;
  maxStars?: number;
  /** Ascension / awakening stars drawn as a second track. */
  awakened?: number;
  level?: number;
  maxLevel?: number;
  /** Affinity key from `AFFINITIES`, e.g. `'void'`. */
  affinity?: string;
  /** Glyph asset id for the role pip, e.g. `'glyph-shield-block'`. */
  role?: string;
  roleLabel?: string;
  /** Power / gear score printed bottom-right. */
  power?: number;
  /** Card width in px; everything else scales from it. */
  size?: number;
  /** Ribbon for freshly pulled units. */
  isNew?: boolean;
  /** Padlock overlay — reserved in a team, or not yet owned. */
  locked?: boolean;
  /** Dim to a silhouette — not collected yet. */
  unowned?: boolean;
  selected?: boolean;
  /** Duplicate / shard count badge. */
  count?: number;
  /** Toggle `selected` on click and emit `champion:select`. */
  selectable?: boolean;
}

/**
 * The collection card that gacha and squad-RPG games are built around:
 * portrait, rarity frame, star rating, level, affinity, role and power, in one
 * tap target.
 *
 * Emits `champion:click`, plus `champion:select` when `selectable` is on.
 *
 *   new ChampionCard({
 *     name: 'Vexhollow', art: 'blood-necromancer', rarity: 'legendary',
 *     stars: 5, level: 50, maxLevel: 60, affinity: 'void',
 *     role: 'glyph-spell-book', power: 42180,
 *   });
 */
export class ChampionCard extends FuiComponent<ChampionCardOptions> {
  readonly stars: StarRating | null = null;
  private levelEl: HTMLElement | null = null;
  private powerEl: HTMLElement | null = null;

  constructor(opts: ChampionCardOptions = {}) {
    const size = opts.size ?? 150;
    const root = h('button', {
      class: 'fui fui-champ',
      dataset: {
        rarity: opts.rarity ?? 'common',
        ...(opts.affinity ? { affinity: opts.affinity } : {}),
      },
      style: { '--fui-champ-w': `${size}px` },
      attrs: { type: 'button', 'aria-label': opts.name ?? 'Champion' },
    });
    if (opts.selected) root.classList.add('is-selected');
    if (opts.locked) root.classList.add('is-locked');
    if (opts.unowned) root.classList.add('is-unowned');
    super(root, opts);

    // ── Art ───────────────────────────────────────────────────────────────
    const art = h('span', { class: 'fui-champ__art', attrs: { 'aria-hidden': 'true' } });
    if (opts.portrait) art.style.backgroundImage = `url("${opts.portrait}")`;
    else if (opts.art) art.style.backgroundImage = `var(--fui-img-${opts.art})`;
    root.appendChild(art);
    root.appendChild(h('span', { class: 'fui-champ__scrim', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(h('span', { class: 'fui-champ__frame', attrs: { 'aria-hidden': 'true' } }));

    // ── Top row: affinity + role ──────────────────────────────────────────
    const top = h('span', { class: 'fui-champ__top' });
    if (opts.affinity && AFFINITIES[opts.affinity]) {
      top.appendChild(new AffinityBadge({ affinity: opts.affinity, size: Math.round(size * 0.19) }).el);
    }
    if (opts.role) {
      top.appendChild(
        h('span', {
          class: 'fui-champ__role',
          style: { '--fui-glyph-src': `var(--fui-img-${opts.role})` },
          attrs: { title: opts.roleLabel },
        }),
      );
    }
    if (top.childElementCount) root.appendChild(top);

    // ── Level pill ────────────────────────────────────────────────────────
    if (opts.level != null) {
      this.levelEl = h('span', {
        class: 'fui-champ__level fui-num',
        text: opts.maxLevel ? `${opts.level}/${opts.maxLevel}` : `Lv ${opts.level}`,
      });
      root.appendChild(this.levelEl);
    }

    // ── Bottom stack: stars, name, power ──────────────────────────────────
    const bottom = h('span', { class: 'fui-champ__bottom' });
    if (opts.stars != null) {
      this.stars = new StarRating({
        value: opts.stars,
        max: opts.maxStars ?? 6,
        size: Math.round(size * 0.105),
        variant: opts.awakened ? 'awaken' : 'star',
      });
      bottom.appendChild(this.stars.el);
    }
    if (opts.name) bottom.appendChild(h('span', { class: 'fui-champ__name', text: opts.name }));
    if (opts.power != null) {
      this.powerEl = h('span', { class: 'fui-champ__power fui-num', text: commas(opts.power) });
      bottom.appendChild(
        h('span', { class: 'fui-champ__powerrow' },
          h('span', { class: 'fui-champ__powericon', attrs: { 'aria-hidden': 'true' } }),
          this.powerEl,
        ),
      );
    }
    root.appendChild(bottom);

    // ── Corner markers ────────────────────────────────────────────────────
    if (opts.isNew) root.appendChild(h('span', { class: 'fui-champ__new', text: 'NEW' }));
    if (opts.count && opts.count > 1) {
      root.appendChild(h('span', { class: 'fui-champ__count fui-num', text: `×${opts.count}` }));
    }
    if (opts.locked) root.appendChild(h('span', { class: 'fui-champ__lock', attrs: { 'aria-hidden': 'true' } }));

    root.addEventListener('click', () => {
      if (opts.selectable) {
        const on = !root.classList.contains('is-selected');
        root.classList.toggle('is-selected', on);
        this.emit('champion:select', { selected: on, champion: opts });
      }
      this.emit('champion:click', opts);
    });
  }

  setLevel(level: number, maxLevel?: number): this {
    if (!this.levelEl) return this;
    const max = maxLevel ?? this.opts.maxLevel;
    this.levelEl.textContent = max ? `${level}/${max}` : `Lv ${level}`;
    return this;
  }

  setPower(power: number): this {
    if (this.powerEl) this.powerEl.textContent = commas(power);
    return this;
  }

  setSelected(selected: boolean): this {
    this.el.classList.toggle('is-selected', selected);
    return this;
  }

  /** Play the ascension flourish — use when a star is gained. */
  celebrate(): this {
    this.el.classList.remove('is-celebrating');
    void this.el.offsetWidth;
    this.el.classList.add('is-celebrating');
    return this;
  }
}
