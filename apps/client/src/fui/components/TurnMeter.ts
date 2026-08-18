// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, clamp } from '../core/dom.ts';

export interface TurnUnit {
  id: string;
  name?: string;
  /** Portrait image URL. */
  portrait?: string;
  /** Or a manifest asset id. */
  art?: string;
  /** Speed stat — drives how fast the meter fills. */
  speed?: number;
  /** Current meter fill, 0–1. */
  meter?: number;
  /** Enemy units are tinted red in the queue. */
  enemy?: boolean;
  /** Dead / removed units stop filling. */
  down?: boolean;
}

export interface TurnMeterOptions extends BaseOptions {
  units?: TurnUnit[];
  /** Advance meters automatically. Default false — most games tick manually. */
  running?: boolean;
  /** Meter points gained per speed point per second. Default 0.07. */
  rate?: number;
  /** Show each unit's own fill bar under its portrait. */
  showBars?: boolean;
  /** Size in pixels. */
  size?: number;
}

/**
 * The turn-order queue used by speed-stat RPGs: every unit fills a meter at a
 * rate set by its speed, and whoever fills first acts next.
 *
 * The queue reorders live, which is the whole reason players care about the
 * speed stat — this makes that visible.
 *
 * Emits `turn:ready` with the unit whose meter fills.
 *
 *   const meter = new TurnMeter({ units, running: true, showBars: true });
 *   meter.on<TurnUnit>('turn:ready', (u) => beginTurn(u.id));
 */
export class TurnMeter extends FuiComponent<TurnMeterOptions> {
  private units: TurnUnit[];
  private queueEl: HTMLElement;
  private raf = 0;
  private last = 0;

  constructor(opts: TurnMeterOptions = {}) {
    const root = h('div', {
      class: 'fui fui-turnmeter',
      style: { '--fui-turn-size': `${opts.size ?? 52}px` },
    });
    super(root, opts);
    this.units = (opts.units ?? []).map((u) => ({ meter: 0, speed: 100, ...u }));

    root.appendChild(h('span', { class: 'fui-turnmeter__label fui-label', text: 'Turn Order' }));
    this.queueEl = h('div', { class: 'fui-turnmeter__queue' });
    root.appendChild(this.queueEl);

    this.render();
    if (opts.running) this.start();
  }

  /** Units sorted by how soon they will act. */
  get order(): TurnUnit[] {
    return [...this.units]
      .filter((u) => !u.down)
      .sort((a, b) => {
        const remainA = (1 - (a.meter ?? 0)) / Math.max(1, a.speed ?? 100);
        const remainB = (1 - (b.meter ?? 0)) / Math.max(1, b.speed ?? 100);
        return remainA - remainB;
      });
  }

  setUnits(units: TurnUnit[]): this {
    this.units = units.map((u) => ({ meter: 0, speed: 100, ...u }));
    this.render();
    return this;
  }

  setMeter(id: string, meter: number): this {
    const unit = this.units.find((u) => u.id === id);
    if (unit) unit.meter = clamp(meter, 0, 1);
    this.render();
    return this;
  }

  /** Reset one unit's meter — call after it has taken its turn. */
  consume(id: string): this {
    return this.setMeter(id, 0);
  }

  /** Advance every meter by `dt` seconds of combat time. */
  tick(dt: number): this {
    const rate = this.opts.rate ?? 0.07;
    for (const unit of this.units) {
      if (unit.down) continue;
      unit.meter = clamp((unit.meter ?? 0) + ((unit.speed ?? 100) / 100) * rate * dt, 0, 1);
      if (unit.meter >= 1) this.emit('turn:ready', unit);
    }
    this.render();
    return this;
  }

  start(): this {
    if (this.raf) return this;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    this.onDestroy(() => this.stop());
    return this;
  }

  stop(): this {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    return this;
  }

  private render(): void {
    clear(this.queueEl);
    this.order.forEach((unit, i) => {
      const cell = h('div', {
        class: 'fui-turnmeter__unit',
        dataset: { side: unit.enemy ? 'enemy' : 'ally' },
        attrs: { title: unit.name },
      });
      if (i === 0) cell.classList.add('is-next');
      if ((unit.meter ?? 0) >= 1) cell.classList.add('is-ready');

      const art = h('span', { class: 'fui-turnmeter__art' });
      if (unit.portrait) art.style.backgroundImage = `url("${unit.portrait}")`;
      else if (unit.art) art.style.backgroundImage = `var(--fui-img-${unit.art})`;
      cell.appendChild(art);

      if (this.opts.showBars !== false) {
        const bar = h('span', { class: 'fui-turnmeter__bar' });
        bar.appendChild(
          h('span', {
            class: 'fui-turnmeter__fill',
            style: { width: `${(unit.meter ?? 0) * 100}%` },
          }),
        );
        cell.appendChild(bar);
      }
      this.queueEl.appendChild(cell);
    });
  }
}
