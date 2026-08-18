// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface StarRatingOptions extends BaseOptions {
  /** Stars currently earned. */
  value?: number;
  /** Total stars on the track. Gacha games usually run 1–6. */
  max?: number;
  /** Size in pixels. */
  size?: number;
  /**
   * `star` is the standard gold rating; `awaken` is the second, hotter track
   * games layer on top once a unit is fully ascended; `stage` is the small
   * 3-star clear rating used on campaign nodes.
   */
  variant?: 'star' | 'awaken' | 'stage';
  /** Print the numeric value after the stars. */
  showValue?: boolean;
  /** Let the player click a star to set the value; emits `stars:change`. */
  interactive?: boolean;
  /** Play the earn animation on the newest star. */
  animate?: boolean;
}

/**
 * The star track every collection game leans on — champion rarity, ascension,
 * and campaign clear ratings.
 *
 *   new StarRating({ value: 4, max: 6 });
 *   new StarRating({ value: 2, max: 6, variant: 'awaken' });
 *   new StarRating({ value: 3, max: 3, variant: 'stage', size: 14 });
 */
export class StarRating extends FuiComponent<StarRatingOptions> {
  private stars: HTMLElement[] = [];
  private value: number;

  constructor(opts: StarRatingOptions = {}) {
    const max = opts.max ?? 6;
    const size = opts.size ?? 18;
    const root = h('div', {
      class: 'fui fui-stars',
      dataset: { variant: opts.variant ?? 'star' },
      style: { '--fui-star-size': `${size}px` },
      attrs: {
        role: 'img',
        'aria-label': `${clamp(opts.value ?? 0, 0, max)} of ${max} stars`,
      },
    });
    super(root, opts);
    this.value = clamp(opts.value ?? 0, 0, max);

    for (let i = 0; i < max; i++) {
      const star = h('span', { class: 'fui-stars__star' });
      if (opts.interactive) {
        star.setAttribute('role', 'button');
        star.setAttribute('tabindex', '0');
        star.addEventListener('click', () => this.set(i + 1));
      }
      this.stars.push(star);
      root.appendChild(star);
    }

    if (opts.showValue) {
      root.appendChild(h('span', { class: 'fui-stars__value fui-num', text: `${this.value}` }));
    }
    if (opts.interactive) root.classList.add('fui-stars--interactive');
    this.paint(opts.animate ?? false);
  }

  get(): number {
    return this.value;
  }

  set(value: number, opts?: { silent?: boolean; animate?: boolean }): this {
    const max = this.opts.max ?? 6;
    const next = clamp(Math.round(value), 0, max);
    const gained = next > this.value;
    this.value = next;
    this.paint(opts?.animate ?? gained);
    this.el.setAttribute('aria-label', `${next} of ${max} stars`);
    const readout = this.el.querySelector('.fui-stars__value');
    if (readout) readout.textContent = String(next);
    if (!opts?.silent) this.emit('stars:change', next);
    return this;
  }

  private paint(animate: boolean): void {
    this.stars.forEach((star, i) => {
      const on = i < this.value;
      star.classList.toggle('is-on', on);
      // Only the newest star pops, so gaining one reads as a single event.
      star.classList.toggle('is-new', animate && on && i === this.value - 1);
    });
  }
}
