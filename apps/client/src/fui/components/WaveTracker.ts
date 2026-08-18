// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface WaveStep {
  /** Short label under the pip — "1", "2", "Boss". */
  label?: string;
  /** Glyph asset id drawn inside the pip. */
  glyph?: string;
  /** Marks this step as the stage's boss encounter. */
  boss?: boolean;
}

export interface WaveTrackerOptions extends BaseOptions {
  /** Total waves, or an explicit list when they differ from each other. */
  waves: number | WaveStep[];
  /** Wave currently being fought, 1-based. */
  current?: number;
  /** Heading, e.g. "Wave" or "Room". */
  label?: string;
  size?: 'sm' | 'md';
  /** Draw a connecting rail behind the pips. */
  rail?: boolean;
}

/**
 * Progress through a stage's waves — the little row of pips that tells a player
 * how much of a dungeon run is left, with the boss wave marked.
 *
 *   const waves = new WaveTracker({ waves: 5, current: 2, label: 'Wave' });
 *   waves.advance();   // clears wave 2, moves to 3
 *
 * Pass an array instead of a number when the waves are not interchangeable —
 * an elite room, a treasure room, a boss.
 */
export class WaveTracker extends FuiComponent<WaveTrackerOptions> {
  private pips: HTMLElement[] = [];
  private current: number;
  private countEl: HTMLElement | null = null;

  constructor(opts: WaveTrackerOptions) {
    const steps: WaveStep[] =
      typeof opts.waves === 'number'
        ? Array.from({ length: opts.waves }, (_, i) => ({ label: String(i + 1) }))
        : opts.waves;

    const root = h('div', { class: 'fui fui-waves', dataset: { size: opts.size ?? 'md' } });
    if (opts.rail ?? true) root.classList.add('fui-waves--rail');
    super(root, opts);

    this.current = clamp(opts.current ?? 1, 1, steps.length);

    if (opts.label) {
      root.appendChild(h('span', { class: 'fui-waves__label fui-label', text: opts.label }));
    }

    const list = h('div', { class: 'fui-waves__list' });
    steps.forEach((step, i) => {
      const pip = h('span', {
        class: 'fui-waves__pip',
        dataset: { index: String(i + 1) },
        attrs: { title: step.label ?? `Wave ${i + 1}` },
      });
      if (step.boss) pip.classList.add('is-boss');
      const dot = h('span', { class: 'fui-waves__dot' });
      if (step.glyph) dot.style.setProperty('--fui-glyph-src', `var(--fui-img-${step.glyph})`);
      pip.appendChild(dot);
      if (step.label) pip.appendChild(h('span', { class: 'fui-waves__tick', text: step.label }));
      this.pips.push(pip);
      list.appendChild(pip);
    });
    root.appendChild(list);

    this.countEl = h('span', { class: 'fui-waves__count fui-num' });
    root.appendChild(this.countEl);
    this.paint();
  }

  get(): number {
    return this.current;
  }

  /** Clear the current wave and move to the next one. */
  advance(): this {
    return this.set(this.current + 1);
  }

  set(wave: number, opts?: { silent?: boolean }): this {
    const total = this.pips.length;
    const next = clamp(wave, 1, total + 1);
    this.current = next;
    this.paint();
    if (!opts?.silent) this.emit('wave:change', next);
    if (next > total) this.emit('wave:clear', total);
    return this;
  }

  private paint(): void {
    this.pips.forEach((pip, i) => {
      const n = i + 1;
      pip.classList.toggle('is-done', n < this.current);
      pip.classList.toggle('is-now', n === this.current);
    });
    const total = this.pips.length;
    this.el.style.setProperty(
      '--fui-waves-p',
      String(clamp((this.current - 1) / Math.max(1, total - 1), 0, 1)),
    );
    if (this.countEl) {
      this.countEl.textContent = `${Math.min(this.current, total)} / ${total}`;
    }
  }
}
