// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, commas, abbreviate } from '../core/dom.ts';

export interface BossHealthBarOptions extends BaseOptions {
  name: string;
  /** Subtitle — "Stage 21 · Nightmare", the boss's title, the affix line. */
  subtitle?: string;
  value: number;
  max: number;
  /** Number of phases the bar is divided into. Each notch is a phase change. */
  phases?: number;
  /** Glyph asset id shown beside the name. */
  glyph?: string;
  /** Affinity or element colour for the fill. */
  color?: string;
  /** Show the raw numbers as well as the bar. */
  showNumbers?: boolean;
  /** Enrage timer in seconds, drawn as a thin bar underneath. */
  enrage?: number;
  /** Seconds elapsed against `enrage`. */
  enrageElapsed?: number;
  /** Status effects riding on the boss. */
  effects?: Array<{ glyph?: string; label: string; turns?: number; debuff?: boolean }>;
}

/**
 * The wide bar across the top of a raid or boss fight: name, phase notches, a
 * damage trail, and an enrage timer counting down underneath.
 *
 *   const boss = new BossHealthBar({
 *     name: 'Clan Boss', subtitle: 'Nightmare · Stage 4',
 *     value: 82_000_000, max: 100_000_000, phases: 4,
 *     enrage: 300, enrageElapsed: 90,
 *     effects: [{ label: 'Decrease DEF', turns: 2, debuff: true }],
 *   });
 *   boss.damage(4_500_000);
 *
 * The trail is the detail that makes a hit land: the white ghost lags behind
 * the fill for a beat so the player sees how much a burst actually took off.
 */
export class BossHealthBar extends FuiComponent<BossHealthBarOptions> {
  private value: number;
  private fill: HTMLElement;
  private trail: HTMLElement;
  private numbers: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private trailTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: BossHealthBarOptions) {
    const root = h('div', {
      class: 'fui fui-boss',
      style: opts.color ? { '--fui-boss-ink': opts.color } : {},
    });
    super(root, opts);
    this.value = clamp(opts.value, 0, opts.max);

    // ── Header ────────────────────────────────────────────────────────────
    const head = h('div', { class: 'fui-boss__head' });
    if (opts.glyph) {
      head.appendChild(
        h('span', {
          class: 'fui-boss__glyph',
          style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` },
        }),
      );
    }
    const titles = h('div', { class: 'fui-boss__titles' });
    titles.appendChild(h('span', { class: 'fui-boss__name fui-title', text: opts.name }));
    if (opts.subtitle) {
      titles.appendChild(h('span', { class: 'fui-boss__subtitle', text: opts.subtitle }));
    }
    head.appendChild(titles);

    if (opts.phases && opts.phases > 1) {
      this.phaseEl = h('span', { class: 'fui-boss__phase fui-num' });
      head.appendChild(this.phaseEl);
    }
    root.appendChild(head);

    // ── Bar ───────────────────────────────────────────────────────────────
    this.trail = h('span', { class: 'fui-boss__trail' });
    this.fill = h('span', { class: 'fui-boss__fill' });
    const track = h('div', { class: 'fui-boss__track' }, this.trail, this.fill);

    if (opts.phases && opts.phases > 1) {
      const notches = h('span', { class: 'fui-boss__notches', attrs: { 'aria-hidden': 'true' } });
      for (let i = 1; i < opts.phases; i++) {
        notches.appendChild(
          h('span', { class: 'fui-boss__notch', style: { left: `${(i / opts.phases) * 100}%` } }),
        );
      }
      track.appendChild(notches);
    }

    if (opts.showNumbers ?? true) {
      this.numbers = h('span', { class: 'fui-boss__numbers fui-num' });
      track.appendChild(this.numbers);
    }
    root.appendChild(track);

    // ── Enrage ────────────────────────────────────────────────────────────
    if (opts.enrage) {
      const pct = clamp((opts.enrageElapsed ?? 0) / opts.enrage, 0, 1);
      const enrage = h('div', {
        class: 'fui-boss__enrage',
        style: { '--fui-boss-enrage': String(pct) },
      });
      enrage.appendChild(h('span', { class: 'fui-boss__enrage-label', text: 'Enrage' }));
      enrage.appendChild(h('span', { class: 'fui-boss__enrage-track' }));
      root.appendChild(enrage);
    }

    if (opts.effects?.length) {
      const list = h('div', { class: 'fui-boss__effects' });
      for (const fx of opts.effects) {
        const chip = h('span', {
          class: 'fui-boss__effect',
          dataset: { kind: fx.debuff ? 'debuff' : 'buff' },
          attrs: { title: fx.label },
        });
        if (fx.glyph) chip.style.setProperty('--fui-glyph-src', `var(--fui-img-${fx.glyph})`);
        else chip.appendChild(h('span', { class: 'fui-boss__effect-text', text: fx.label }));
        if (fx.turns) chip.appendChild(h('span', { class: 'fui-boss__effect-turns', text: String(fx.turns) }));
        list.appendChild(chip);
      }
      root.appendChild(list);
    }

    this.paint(false);
    this.onDestroy(() => {
      if (this.trailTimer) clearTimeout(this.trailTimer);
    });
  }

  get(): number {
    return this.value;
  }

  /** Take health off, leaving a trail behind so the hit is visible. */
  damage(amount: number): this {
    return this.set(this.value - amount);
  }

  set(value: number, opts?: { silent?: boolean }): this {
    const was = this.value;
    this.value = clamp(value, 0, this.opts.max);
    this.paint(this.value < was);
    if (!opts?.silent) this.emit('boss:change', this.value);
    if (was > 0 && this.value === 0) this.emit('boss:defeat');
    const phases = this.opts.phases ?? 1;
    if (phases > 1 && this.phaseOf(was) !== this.phaseOf(this.value)) {
      this.emit('boss:phase', this.phaseOf(this.value));
    }
    return this;
  }

  /** Which phase a health value falls in, counting down from `phases`. */
  private phaseOf(value: number): number {
    const phases = this.opts.phases ?? 1;
    if (value <= 0) return 1;
    return Math.max(1, Math.ceil((value / this.opts.max) * phases));
  }

  /** Advance the enrage timer, in seconds elapsed. */
  setEnrage(elapsed: number): this {
    if (!this.opts.enrage) return this;
    const pct = clamp(elapsed / this.opts.enrage, 0, 1);
    this.el.style.setProperty('--fui-boss-enrage', String(pct));
    this.el.classList.toggle('is-enraged', pct >= 1);
    if (pct >= 1) this.emit('boss:enrage');
    return this;
  }

  private paint(hit: boolean): void {
    const pct = (this.value / this.opts.max) * 100;
    this.fill.style.width = `${pct.toFixed(3)}%`;
    if (this.numbers) {
      this.numbers.textContent = `${abbreviate(this.value)} / ${abbreviate(this.opts.max)}`;
      this.numbers.title = `${commas(this.value)} / ${commas(this.opts.max)}`;
    }
    if (this.phaseEl) {
      this.phaseEl.textContent = `Phase ${this.phaseOf(this.value)} / ${this.opts.phases}`;
    }
    if (!hit) {
      this.trail.style.width = `${pct.toFixed(3)}%`;
      return;
    }
    // The trail holds at the old width, then catches up — that lag is what
    // makes a big hit read as a big hit.
    if (this.trailTimer) clearTimeout(this.trailTimer);
    this.trailTimer = setTimeout(() => {
      this.trail.style.width = `${pct.toFixed(3)}%`;
      this.trailTimer = null;
    }, 260);
  }
}
