// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, commas, duration } from '../core/dom.ts';

export interface EnergyBarOptions extends BaseOptions {
  value?: number;
  max?: number;
  /** Seconds to regenerate one point. Omit to disable regeneration. */
  regenSeconds?: number;
  /** Glyph asset id for the pip. Defaults to a lightning-ish arcane mark. */
  glyph?: string;
  label?: string;
  /** Show a `+` button that emits `energy:refill`. */
  refillable?: boolean;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Tick the clock and top up automatically. Default true. */
  autoRegen?: boolean;
}

/**
 * The energy / stamina gate that paces session length in mobile RPGs: a
 * capped pool, a countdown to the next point, and a refill affordance.
 *
 * Emits `energy:change`, `energy:full` and `energy:refill`.
 *
 *   const energy = new EnergyBar({ value: 42, max: 130, regenSeconds: 360, refillable: true });
 *   if (energy.spend(20)) startBattle();
 */
export class EnergyBar extends FuiComponent<EnergyBarOptions> {
  private fill: HTMLElement;
  private readout: HTMLElement;
  private timerEl: HTMLElement;
  private timer: ReturnType<typeof setInterval> | null = null;

  private value: number;
  private max: number;
  /** Epoch ms when the next point lands. */
  private nextAt = 0;

  constructor(opts: EnergyBarOptions = {}) {
    const root = h('div', {
      class: 'fui fui-energy',
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
    });
    super(root, opts);

    this.max = Math.max(1, opts.max ?? 100);
    this.value = clamp(opts.value ?? this.max, 0, this.max);

    root.appendChild(
      h('span', {
        class: 'fui-energy__glyph',
        style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph ?? 'glyph-arcane-symbol'})` },
        attrs: { 'aria-hidden': 'true' },
      }),
    );

    const track = h('div', { class: 'fui-energy__track' });
    this.fill = h('div', { class: 'fui-energy__fill' });
    this.readout = h('span', { class: 'fui-energy__readout fui-num' });
    track.append(this.fill, this.readout);
    root.appendChild(track);

    this.timerEl = h('span', { class: 'fui-energy__timer fui-num' });
    root.appendChild(this.timerEl);

    if (opts.refillable) {
      const plus = h('button', {
        class: 'fui-energy__refill',
        attrs: { type: 'button', 'aria-label': 'Refill energy' },
        text: '+',
      });
      plus.addEventListener('click', () => this.emit('energy:refill', { value: this.value, max: this.max }));
      root.appendChild(plus);
    }

    if (opts.regenSeconds && opts.autoRegen !== false) {
      this.nextAt = Date.now() + opts.regenSeconds * 1000;
      this.timer = setInterval(() => this.tick(), 1000);
      this.onDestroy(() => this.timer && clearInterval(this.timer));
    }
    this.paint();
  }

  get(): number {
    return this.value;
  }

  set(value: number): this {
    const was = this.value;
    this.value = clamp(value, 0, this.max);
    // Dropping below the cap restarts the regeneration clock.
    if (this.opts.regenSeconds && was >= this.max && this.value < this.max) {
      this.nextAt = Date.now() + this.opts.regenSeconds * 1000;
    }
    this.paint();
    this.emit('energy:change', { value: this.value, max: this.max });
    if (this.value >= this.max) this.emit('energy:full');
    return this;
  }

  /** Spend energy if there is enough. Returns false and shakes if not. */
  spend(cost: number): boolean {
    if (cost > this.value) {
      this.el.classList.remove('is-denied');
      void this.el.offsetWidth;
      this.el.classList.add('is-denied');
      this.emit('energy:denied', { cost, value: this.value });
      return false;
    }
    this.set(this.value - cost);
    return true;
  }

  private tick(): void {
    if (this.value >= this.max) {
      this.timerEl.textContent = 'Full';
      return;
    }
    if (Date.now() >= this.nextAt) {
      this.nextAt = Date.now() + (this.opts.regenSeconds ?? 60) * 1000;
      this.set(this.value + 1);
      return;
    }
    this.paintTimer();
  }

  private paintTimer(): void {
    if (!this.opts.regenSeconds) {
      this.timerEl.textContent = '';
      return;
    }
    this.timerEl.textContent =
      this.value >= this.max ? 'Full' : duration(Math.max(0, (this.nextAt - Date.now()) / 1000));
  }

  private paint(): void {
    const pct = (this.value / this.max) * 100;
    this.fill.style.width = `${pct}%`;
    this.readout.textContent = `${commas(this.value)} / ${commas(this.max)}`;
    this.el.classList.toggle('is-full', this.value >= this.max);
    this.paintTimer();
  }
}
