// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { ChampionCard, type ChampionCardOptions } from './ChampionCard.ts';

export interface SummonPull extends ChampionCardOptions {
  id: string;
  /** Marks a unit the player did not already own. */
  isNew?: boolean;
}

export interface SummonResultOptions extends BaseOptions {
  pulls: SummonPull[];
  /** Card width in the reveal grid. */
  cardSize?: number;
  /** Reveal one card per tap. When false the whole pull shows at once. */
  tapToReveal?: boolean;
  /** Milliseconds between cards when revealing all. Default 220. */
  stagger?: number;
  title?: string;
}

/** Rarities that deserve the full-screen flare. */
const BIG_PULL: Rarity[] = ['legendary', 'mythic'];

/**
 * The summon reveal: face-down cards that flip one at a time, with the burst
 * scaled to the best rarity in the pull.
 *
 * Emits `summon:reveal` per card and `summon:done` when the pull is finished.
 *
 *   const result = new SummonResult({ pulls, tapToReveal: true });
 *   result.on('summon:done', () => showSummary());
 */
export class SummonResult extends FuiComponent<SummonResultOptions> {
  private gridEl: HTMLElement;
  private cells: HTMLElement[] = [];
  private revealed = new Set<number>();

  constructor(opts: SummonResultOptions) {
    const best = opts.pulls.reduce<Rarity>(
      (top, p) => (BIG_PULL.includes(p.rarity as Rarity) ? (p.rarity as Rarity) : top),
      'common',
    );
    const root = h('div', {
      class: 'fui fui-summon',
      dataset: { best },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-summon__rays', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(
      h('h2', { class: 'fui-summon__title fui-title', text: opts.title ?? 'Summon' }),
    );

    this.gridEl = h('div', { class: 'fui-summon__grid' });
    root.appendChild(this.gridEl);

    const all = h('button', {
      class: 'fui-summon__all',
      attrs: { type: 'button' },
      text: 'Reveal All',
    });
    all.addEventListener('click', () => this.revealAll());
    root.appendChild(all);

    this.render();
    if (opts.tapToReveal === false) this.revealAll();
  }

  private render(): void {
    clear(this.gridEl);
    this.cells = [];

    this.opts.pulls.forEach((pull, i) => {
      const cell = h('div', { class: 'fui-summon__cell', dataset: { rarity: pull.rarity ?? 'common' } });

      const back = h('button', {
        class: 'fui-summon__back',
        attrs: { type: 'button', 'aria-label': 'Reveal' },
        style: { '--fui-champ-w': `${this.opts.cardSize ?? 130}px` },
      });
      back.appendChild(h('span', { class: 'fui-summon__seal', attrs: { 'aria-hidden': 'true' } }));
      back.addEventListener('click', () => this.reveal(i));
      cell.appendChild(back);

      const card = new ChampionCard({ ...pull, size: this.opts.cardSize ?? 130 });
      const face = h('div', { class: 'fui-summon__face' }, card.el);
      if (pull.isNew) face.appendChild(h('span', { class: 'fui-summon__newtag', text: 'NEW' }));
      cell.appendChild(face);

      this.cells.push(cell);
      this.gridEl.appendChild(cell);
    });
  }

  /** Flip one card. */
  reveal(index: number): this {
    if (this.revealed.has(index)) return this;
    const cell = this.cells[index];
    if (!cell) return this;

    this.revealed.add(index);
    cell.classList.add('is-revealed');
    const pull = this.opts.pulls[index];

    // A top-rarity pull escalates the whole screen, not just the card.
    if (BIG_PULL.includes(pull.rarity as Rarity)) {
      this.el.classList.remove('is-flaring');
      void this.el.offsetWidth;
      this.el.classList.add('is-flaring');
    }

    this.emit('summon:reveal', { index, pull });
    if (this.revealed.size === this.opts.pulls.length) this.emit('summon:done', this.opts.pulls);
    return this;
  }

  /** Flip everything still face-down, staggered. */
  revealAll(): this {
    const gap = this.opts.stagger ?? 220;
    this.opts.pulls.forEach((_, i) => {
      if (this.revealed.has(i)) return;
      const t = setTimeout(() => this.reveal(i), i * gap);
      this.onDestroy(() => clearTimeout(t));
    });
    return this;
  }
}
