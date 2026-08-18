// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface CountdownTimerOptions extends BaseOptions {
  /** Seconds remaining. Use this when you only know a duration. */
  seconds?: number;
  /** Or an absolute end time in epoch milliseconds; survives tab throttling. */
  endsAt?: number;
  label?: string;
  /** Glyph asset id shown before the time. */
  glyph?: string;
  /** `chip` is the inline pill; `block` is the large event readout. */
  variant?: 'chip' | 'block';
  /** Turn urgent below this many seconds. Default 3600. */
  urgentAt?: number;
  /** Text shown once the timer reaches zero. */
  doneText?: string;
  onEnd?: () => void;
}

/** Split seconds into the d/h/m/s parts a countdown needs. */
function parts(total: number) {
  const s = Math.max(0, Math.floor(total));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/**
 * The "event ends in…" clock that live-service games put on offers, dungeon
 * resets, energy refills and battle passes.
 *
 * Anchoring to an absolute `endsAt` rather than counting ticks means the timer
 * stays correct after the tab is backgrounded and the interval is throttled.
 *
 *   new CountdownTimer({ endsAt: Date.now() + 86_400_000, label: 'Event ends' });
 *   new CountdownTimer({ seconds: 240, variant: 'chip', glyph: 'glyph-hourglass' });
 */
export class CountdownTimer extends FuiComponent<CountdownTimerOptions> {
  private timeEl: HTMLElement;
  private endsAt: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false;

  constructor(opts: CountdownTimerOptions = {}) {
    const root = h('div', {
      class: 'fui fui-countdown',
      dataset: { variant: opts.variant ?? 'chip' },
      attrs: { role: 'timer' },
    });
    super(root, opts);

    this.endsAt = opts.endsAt ?? Date.now() + (opts.seconds ?? 0) * 1000;

    if (opts.glyph) {
      root.appendChild(
        h('span', {
          class: 'fui-countdown__glyph',
          style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` },
        }),
      );
    }
    if (opts.label) root.appendChild(h('span', { class: 'fui-countdown__label', text: opts.label }));
    this.timeEl = h('span', { class: 'fui-countdown__time fui-num' });
    root.appendChild(this.timeEl);

    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    this.onDestroy(() => this.timer && clearInterval(this.timer));
  }

  /** Seconds left, never negative. */
  get remaining(): number {
    return Math.max(0, (this.endsAt - Date.now()) / 1000);
  }

  /** Restart the clock with a fresh duration. */
  reset(seconds: number): this {
    this.endsAt = Date.now() + seconds * 1000;
    this.ended = false;
    this.el.classList.remove('is-done');
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
    return this;
  }

  private tick(): void {
    const left = this.remaining;
    const { d, h: hh, m, s } = parts(left);

    this.timeEl.textContent =
      left <= 0
        ? (this.opts.doneText ?? 'Ready')
        : d > 0
          ? `${d}d ${hh}h`
          : hh > 0
            ? `${hh}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;

    this.el.classList.toggle('is-urgent', left > 0 && left <= (this.opts.urgentAt ?? 3600));

    if (left <= 0 && !this.ended) {
      this.ended = true;
      this.el.classList.add('is-done');
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.opts.onEnd?.();
      this.emit('countdown:end');
    }
  }
}
