// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type StatKind } from '../core/component.ts';
import { h, clamp, abbreviate } from '../core/dom.ts';

export interface ShieldBarOptions extends BaseOptions {
  /** Underlying health. */
  value: number;
  max: number;
  /** Absorb riding on top. Can exceed `max` — it overflows past the end. */
  shield?: number;
  /** Recolours the health portion. */
  kind?: StatKind;
  /** Bar height in pixels. */
  height?: number;
  /** Print the numbers over the bar. */
  showNumbers?: boolean;
  /** Portion of the bar that is unhealable — the "damage taken" cap. */
  locked?: number;
  label?: string;
}

/**
 * Health with an absorb layer on top — barriers, wards, overshields. The shield
 * segment sits *past* the health fill rather than replacing it, so a player can
 * see both what they have and what is protecting it.
 *
 *   const hp = new ShieldBar({ value: 620, max: 1000, shield: 240, kind: 'health' });
 *   hp.hit(300);   // eats the shield first, then health — the way the game does
 *
 * `hit()` applies damage in the same order the combat system should: shield
 * first, remainder to health.
 */
export class ShieldBar extends FuiComponent<ShieldBarOptions> {
  private value: number;
  private shield: number;
  private fill: HTMLElement;
  private shieldEl: HTMLElement;
  private numbers: HTMLElement | null = null;

  constructor(opts: ShieldBarOptions) {
    const root = h('div', {
      class: 'fui fui-shieldbar',
      dataset: { kind: opts.kind ?? 'health' },
      style: { '--fui-shield-h': `${opts.height ?? 18}px` },
      attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': opts.max },
    });
    super(root, opts);

    this.value = clamp(opts.value, 0, opts.max);
    this.shield = Math.max(0, opts.shield ?? 0);

    if (opts.label) root.appendChild(h('span', { class: 'fui-shieldbar__label', text: opts.label }));

    this.fill = h('span', { class: 'fui-shieldbar__fill' });
    this.shieldEl = h('span', { class: 'fui-shieldbar__shield' });
    const track = h('div', { class: 'fui-shieldbar__track' }, this.fill, this.shieldEl);

    if (opts.locked) {
      // The unhealable cap is drawn as a hatched region hanging off the right
      // end, which is how games that use it communicate a hard ceiling.
      track.appendChild(
        h('span', {
          class: 'fui-shieldbar__locked',
          style: { width: `${(clamp(opts.locked, 0, opts.max) / opts.max) * 100}%` },
        }),
      );
    }
    if (opts.showNumbers ?? true) {
      this.numbers = h('span', { class: 'fui-shieldbar__numbers fui-num' });
      track.appendChild(this.numbers);
    }
    root.appendChild(track);
    this.paint();
  }

  get(): { value: number; shield: number } {
    return { value: this.value, shield: this.shield };
  }

  /** Apply damage: shield absorbs first, the remainder comes off health. */
  hit(amount: number): this {
    const absorbed = Math.min(this.shield, amount);
    this.shield -= absorbed;
    const through = amount - absorbed;
    this.value = clamp(this.value - through, 0, this.opts.max);
    this.paint();
    this.emit('shield:hit', { absorbed, through, value: this.value, shield: this.shield });
    if (absorbed > 0 && this.shield === 0) this.emit('shield:break');
    if (this.value === 0) this.emit('shield:down');
    return this;
  }

  set(value: number, shield?: number): this {
    this.value = clamp(value, 0, this.opts.max);
    if (shield != null) this.shield = Math.max(0, shield);
    this.paint();
    return this;
  }

  /** Add absorb on top of whatever is already there. */
  addShield(amount: number): this {
    this.shield = Math.max(0, this.shield + amount);
    this.paint();
    return this;
  }

  private paint(): void {
    const hpPct = (this.value / this.opts.max) * 100;
    // Shield is measured against the same scale, and is allowed to overflow
    // past 100% — clipped by the track, which reads as "more than full".
    const shPct = (this.shield / this.opts.max) * 100;
    this.fill.style.width = `${hpPct.toFixed(2)}%`;
    this.shieldEl.style.width = `${Math.min(shPct, 100 - Math.min(hpPct, 100)).toFixed(2)}%`;
    this.shieldEl.style.left = `${Math.min(hpPct, 100).toFixed(2)}%`;
    this.el.classList.toggle('has-shield', this.shield > 0);
    this.el.setAttribute('aria-valuenow', String(this.value));
    if (this.numbers) {
      this.numbers.textContent =
        this.shield > 0
          ? `${abbreviate(this.value)} (+${abbreviate(this.shield)}) / ${abbreviate(this.opts.max)}`
          : `${abbreviate(this.value)} / ${abbreviate(this.opts.max)}`;
    }
  }
}
