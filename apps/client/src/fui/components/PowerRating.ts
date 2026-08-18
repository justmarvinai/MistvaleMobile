// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas, abbreviate } from '../core/dom.ts';

export interface PowerPart {
  label: string;
  value: number;
  color?: string;
}

export interface PowerRatingOptions extends BaseOptions {
  /** Total power / gear score. */
  value: number;
  /** Change against the previous state — shown as a coloured delta. */
  delta?: number;
  /** Heading over the number. */
  label?: string;
  /** Where the number comes from, drawn as a stacked bar and a legend. */
  parts?: PowerPart[];
  /** Rank among all players, e.g. "Top 3%". */
  rank?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Abbreviate the headline number: 1240000 becomes "1.24M". */
  compact?: boolean;
  /** Count the number up from zero when first shown. */
  animate?: boolean;
}

/**
 * The single number a player uses to decide whether they can clear the next
 * stage — total power, gear score, team rating — with an optional breakdown of
 * where it comes from.
 *
 *   const power = new PowerRating({
 *     value: 184320, delta: 2180, label: 'Team Power', rank: 'Top 8%',
 *     parts: [
 *       { label: 'Champions', value: 120000, color: 'var(--fui-accent)' },
 *       { label: 'Gear', value: 44320, color: 'var(--fui-gold)' },
 *       { label: 'Masteries', value: 20000, color: 'var(--fui-rarity-epic)' },
 *     ],
 *   });
 *   power.set(186500); // rolls up to the new number and shows the gain
 */
export class PowerRating extends FuiComponent<PowerRatingOptions> {
  private value: number;
  private valueEl: HTMLElement;
  private deltaEl: HTMLElement | null = null;
  private raf: number | null = null;

  constructor(opts: PowerRatingOptions) {
    const root = h('div', { class: 'fui fui-power', dataset: { size: opts.size ?? 'md' } });
    super(root, opts);
    this.value = opts.value;

    if (opts.label) {
      root.appendChild(h('span', { class: 'fui-power__label fui-label', text: opts.label }));
    }

    const line = h('div', { class: 'fui-power__line' });
    this.valueEl = h('span', { class: 'fui-power__value fui-num' });
    line.appendChild(this.valueEl);
    this.deltaEl = h('span', { class: 'fui-power__delta fui-num' });
    line.appendChild(this.deltaEl);
    root.appendChild(line);

    if (opts.rank) root.appendChild(h('span', { class: 'fui-power__rank', text: opts.rank }));

    if (opts.parts?.length) {
      const total = opts.parts.reduce((sum, p) => sum + p.value, 0) || 1;
      const bar = h('div', { class: 'fui-power__bar' });
      const legend = h('div', { class: 'fui-power__legend' });
      for (const part of opts.parts) {
        const share = part.value / total;
        bar.appendChild(
          h('span', {
            class: 'fui-power__seg',
            style: {
              width: `${(share * 100).toFixed(2)}%`,
              background: part.color ?? 'var(--fui-accent)',
            },
            attrs: { title: `${part.label}: ${commas(part.value)}` },
          }),
        );
        const item = h('span', { class: 'fui-power__legend-item' });
        item.appendChild(
          h('span', {
            class: 'fui-power__swatch',
            style: { background: part.color ?? 'var(--fui-accent)' },
          }),
        );
        item.appendChild(h('span', { text: part.label }));
        item.appendChild(h('span', { class: 'fui-power__legend-value fui-num', text: abbreviate(part.value) }));
        legend.appendChild(item);
      }
      root.append(bar, legend);
    }

    this.paint(this.value, opts.delta);
    if (opts.animate) this.rollTo(this.value, 0);
    this.onDestroy(() => {
      if (this.raf != null) cancelAnimationFrame(this.raf);
    });
  }

  get(): number {
    return this.value;
  }

  /** Set a new total. The number rolls up and the delta shows the change. */
  set(value: number, opts?: { silent?: boolean }): this {
    const from = this.value;
    this.value = value;
    this.rollTo(value, from);
    this.paint(value, value - from);
    if (!opts?.silent) this.emit('power:change', value);
    return this;
  }

  /** Count from `from` to `to` over ~600ms, so a gain is felt, not just read. */
  private rollTo(to: number, from: number): void {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    if (typeof requestAnimationFrame !== 'function') return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      // Ease-out cubic: fast at first, settling on the final number.
      const eased = 1 - Math.pow(1 - t, 3);
      this.write(Math.round(from + (to - from) * eased));
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.raf = null;
    };
    this.raf = requestAnimationFrame(step);
  }

  private write(n: number): void {
    this.valueEl.textContent = this.opts.compact ? abbreviate(n) : commas(n);
  }

  private paint(value: number, delta?: number): void {
    this.write(value);
    if (!this.deltaEl) return;
    if (!delta) {
      this.deltaEl.textContent = '';
      this.deltaEl.dataset.dir = 'flat';
      return;
    }
    this.deltaEl.textContent = `${delta > 0 ? '+' : '−'}${commas(Math.abs(delta))}`;
    this.deltaEl.dataset.dir = delta > 0 ? 'up' : 'down';
  }
}
