// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type StatKind } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface StatBarOptions extends BaseOptions {
  /** Which resource this represents — drives the fill artwork and colour. */
  kind?: StatKind;
  value?: number;
  max?: number;
  /** Caption on the left, e.g. `'Health'`. */
  label?: string;
  /** `'none'` hides the readout, `'ratio'` shows 80 / 100, `'pct'` shows 80%. */
  readout?: 'none' | 'ratio' | 'pct';
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /**
   * Leaves a slower-draining ghost behind the fill when the value drops, the
   * classic fighting-game / MMO damage cue. On by default.
   */
  trail?: boolean;
  /** Divide the bar into N pips — good for segmented stamina or charges. */
  segments?: number;
  /** Pulse the bar when the value falls below this fraction (0–1). */
  dangerAt?: number;
}

/**
 * Health, mana, stamina, XP — any depleting or filling resource.
 *
 *   const hp = new StatBar({ kind: 'health', value: 72, max: 100, label: 'Health' });
 *   hp.set(48);          // animates, and leaves a damage trail behind
 *   hp.setMax(120);
 */
export class StatBar extends FuiComponent<StatBarOptions> {
  private fill: HTMLElement;
  private trailEl: HTMLElement | null = null;
  private readoutEl: HTMLElement | null = null;
  private trailTimer: ReturnType<typeof setTimeout> | null = null;

  private value: number;
  private max: number;

  constructor(opts: StatBarOptions = {}) {
    const kind = opts.kind ?? 'health';
    const readout = opts.readout ?? 'ratio';

    const root = h('div', {
      class: 'fui fui-bar',
      dataset: { kind },
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
      attrs: {
        role: 'progressbar',
        'aria-label': opts.label ?? kind,
      },
    });

    super(root, opts);

    this.value = opts.value ?? 100;
    this.max = Math.max(1, opts.max ?? 100);

    root.appendChild(h('div', { class: 'fui-bar__track', attrs: { 'aria-hidden': 'true' } }));

    const well = h('div', { class: 'fui-bar__well' });
    if (opts.trail !== false) {
      this.trailEl = h('div', { class: 'fui-bar__trail' });
      well.appendChild(this.trailEl);
    }
    this.fill = h('div', { class: 'fui-bar__fill' });
    well.appendChild(this.fill);

    if (opts.segments && opts.segments > 1) {
      well.appendChild(
        h('div', {
          class: 'fui-bar__segments',
          style: { '--fui-seg': String(opts.segments) },
        }),
      );
    }
    root.appendChild(well);

    if (opts.label || readout !== 'none') {
      const overlay = h('div', { class: 'fui-bar__text' });
      if (opts.label) overlay.appendChild(h('span', { class: 'fui-bar__label', text: opts.label }));
      if (readout !== 'none') {
        this.readoutEl = h('span', { class: 'fui-bar__value fui-num' });
        overlay.appendChild(this.readoutEl);
      }
      root.appendChild(overlay);
    }

    if (opts.dangerAt != null) root.dataset.dangerAt = String(opts.dangerAt);
    this.render(true);
  }

  /** Current value. */
  get(): number {
    return this.value;
  }

  /** Set the value; the bar animates and leaves a damage trail on a decrease. */
  set(value: number, opts?: { animate?: boolean }): this {
    const next = clamp(value, 0, this.max);
    const dropped = next < this.value;
    this.value = next;
    this.render(opts?.animate === false);

    if (dropped && this.trailEl) {
      if (this.trailTimer) clearTimeout(this.trailTimer);
      // The trail holds at the old width, then catches up.
      this.trailTimer = setTimeout(() => {
        if (this.trailEl) this.trailEl.style.width = `${this.pct() * 100}%`;
      }, 260);
      this.onDestroy(() => this.trailTimer && clearTimeout(this.trailTimer));
    } else if (this.trailEl) {
      this.trailEl.style.width = `${this.pct() * 100}%`;
    }

    this.emit('bar:change', { value: this.value, max: this.max, pct: this.pct() });
    return this;
  }

  /** Relative change — `bar.add(-12)` for a hit, `bar.add(30)` for a heal. */
  add(delta: number): this {
    return this.set(this.value + delta);
  }

  setMax(max: number): this {
    this.max = Math.max(1, max);
    return this.set(this.value);
  }

  /** Fraction filled, 0–1. */
  pct(): number {
    return clamp(this.value / this.max, 0, 1);
  }

  private render(immediate: boolean): void {
    const pct = this.pct();
    if (immediate) this.el.classList.add('fui-bar--noanim');
    this.fill.style.width = `${pct * 100}%`;
    if (immediate && this.trailEl) this.trailEl.style.width = `${pct * 100}%`;
    if (immediate) {
      void this.el.offsetWidth;
      this.el.classList.remove('fui-bar--noanim');
    }

    if (this.readoutEl) {
      this.readoutEl.textContent =
        (this.opts.readout ?? 'ratio') === 'pct'
          ? `${Math.round(pct * 100)}%`
          : `${commas(this.value)} / ${commas(this.max)}`;
    }

    const danger = this.opts.dangerAt;
    this.el.classList.toggle('fui-bar--danger', danger != null && pct <= danger);

    this.el.setAttribute('aria-valuenow', String(Math.round(this.value)));
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', String(this.max));
  }
}
