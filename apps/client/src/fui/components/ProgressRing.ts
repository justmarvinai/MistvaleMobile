// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type StatKind } from '../core/component.ts';
import { h, clamp, duration } from '../core/dom.ts';

export interface ProgressRingOptions extends BaseOptions {
  value?: number;
  max?: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Ring thickness in pixels. Defaults to a tenth of `size`. */
  thickness?: number;
  /** Recolours the ring to a resource palette. */
  kind?: StatKind;
  /** Any CSS colour, overriding `kind`. */
  color?: string;
  /** Big text in the middle. Defaults to the percentage. */
  label?: string;
  /** Small text under the label. */
  sublabel?: string;
  /** Render the value as a `m:ss` countdown instead of a percentage. */
  countdown?: boolean;
  /** Hide the centre text entirely. */
  bare?: boolean;
  /** Sweep anticlockwise — reads as time draining rather than progress filling. */
  reverse?: boolean;
}

/**
 * A circular progress dial for anything that is easier to read as a sweep than
 * as a bar: ability cooldowns, energy refill timers, event countdowns, campaign
 * completion, download progress on a loading screen.
 *
 *   new ProgressRing({ value: 68, label: '68%', kind: 'mana' });
 *   new ProgressRing({ value: 42, max: 120, countdown: true, sublabel: 'Energy' });
 *
 * Drawn with a `conic-gradient`, so there is no SVG and no layout cost — it
 * animates on the compositor.
 */
export class ProgressRing extends FuiComponent<ProgressRingOptions> {
  private value: number;
  private labelEl: HTMLElement | null = null;
  private ringEl: HTMLElement;

  constructor(opts: ProgressRingOptions = {}) {
    const size = opts.size ?? 84;
    const thickness = opts.thickness ?? Math.max(4, Math.round(size / 10));
    const root = h('div', {
      class: 'fui fui-ring',
      dataset: { kind: opts.kind ?? 'neutral' },
      style: {
        '--fui-ring-size': `${size}px`,
        '--fui-ring-thick': `${thickness}px`,
        ...(opts.color ? { '--fui-ring-color': opts.color } : {}),
      },
      attrs: {
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': opts.max ?? 100,
        'aria-valuenow': opts.value ?? 0,
      },
    });
    if (opts.reverse) root.classList.add('fui-ring--reverse');
    super(root, opts);

    this.value = clamp(opts.value ?? 0, 0, opts.max ?? 100);
    this.ringEl = h('div', { class: 'fui-ring__track', attrs: { 'aria-hidden': 'true' } });
    root.appendChild(this.ringEl);

    if (!opts.bare) {
      this.labelEl = h('span', { class: 'fui-ring__label fui-num' });
      const centre = h('div', { class: 'fui-ring__centre' }, this.labelEl);
      if (opts.sublabel) {
        centre.appendChild(h('span', { class: 'fui-ring__sub', text: opts.sublabel }));
      }
      root.appendChild(centre);
    }
    this.paint();
  }

  get(): number {
    return this.value;
  }

  set(value: number, opts?: { silent?: boolean }): this {
    this.value = clamp(value, 0, this.opts.max ?? 100);
    this.paint();
    this.el.setAttribute('aria-valuenow', String(this.value));
    if (!opts?.silent) this.emit('ring:change', this.value);
    if (this.value >= (this.opts.max ?? 100)) this.emit('ring:complete', this.value);
    return this;
  }

  private paint(): void {
    const max = this.opts.max ?? 100;
    const pct = max > 0 ? this.value / max : 0;
    this.el.style.setProperty('--fui-ring-pct', String(pct));
    if (!this.labelEl) return;
    this.labelEl.textContent =
      this.opts.label ??
      (this.opts.countdown ? duration(this.value) : `${Math.round(pct * 100)}%`);
  }
}
