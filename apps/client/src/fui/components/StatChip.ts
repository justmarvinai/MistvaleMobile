// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, abbreviate } from '../core/dom.ts';

export type ChipTone = 'neutral' | 'accent' | 'gold' | 'good' | 'bad' | 'info';

export interface StatChipOptions extends BaseOptions {
  /** Short stat name — ATK, DEF, SPD, C.RATE. */
  label?: string;
  value: number | string;
  /** Glyph asset id drawn before the label. */
  glyph?: string;
  /** Signed change shown after the value, coloured by sign. */
  delta?: number;
  /** Render `delta` as a percentage. */
  deltaPercent?: boolean;
  /** Append a unit to the value, e.g. `'%'`. */
  suffix?: string;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  /** Abbreviate large numbers: 1240000 becomes "1.24M". */
  compact?: boolean;
}

/**
 * A compact labelled stat — the atom every roster row, gear tooltip and compare
 * view is built from.
 *
 *   new StatChip({ glyph: 'glyph-crossed-swords', label: 'ATK', value: 1482 });
 *   new StatChip({ label: 'C.RATE', value: 62, suffix: '%', delta: 15, tone: 'gold' });
 *
 * `delta` is the piece worth having: a chip that knows it went up by 15 renders
 * the arrow, the colour and the sign without the caller formatting anything.
 */
export class StatChip extends FuiComponent<StatChipOptions> {
  private valueEl: HTMLElement;
  private deltaEl: HTMLElement | null = null;

  constructor(opts: StatChipOptions) {
    const root = h('div', {
      class: 'fui fui-chip',
      dataset: { tone: opts.tone ?? 'neutral', size: opts.size ?? 'md' },
    });
    super(root, opts);

    if (opts.glyph) {
      root.appendChild(
        h('span', {
          class: 'fui-chip__glyph',
          style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (opts.label) root.appendChild(h('span', { class: 'fui-chip__label', text: opts.label }));

    this.valueEl = h('span', { class: 'fui-chip__value fui-num' });
    root.appendChild(this.valueEl);

    if (opts.delta != null) {
      this.deltaEl = h('span', { class: 'fui-chip__delta fui-num' });
      root.appendChild(this.deltaEl);
    }
    this.paint(opts.value, opts.delta);
  }

  /** Update the value, and optionally the delta beside it. */
  set(value: number | string, delta?: number): this {
    this.paint(value, delta ?? this.opts.delta);
    return this;
  }

  private paint(value: number | string, delta?: number): void {
    const shown =
      typeof value === 'number' && this.opts.compact ? abbreviate(value) : String(value);
    this.valueEl.textContent = shown + (this.opts.suffix ?? '');
    if (!this.deltaEl || delta == null) return;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    this.deltaEl.textContent = `${sign}${Math.abs(delta)}${this.opts.deltaPercent ? '%' : ''}`;
    this.deltaEl.dataset.dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }
}
