// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface StreakMeterOptions extends BaseOptions {
  /** Days (or wins) in a row. */
  value: number;
  /** Length of the visible track. Longer streaks keep counting past it. */
  length?: number;
  /** Milestone positions that pay out, 1-based. */
  milestones?: number[];
  /** Word after the number — "day streak", "wins". */
  unit?: string;
  /** Glyph asset id for the flame / pip icon. */
  glyph?: string;
  /** True when today's entry has not been claimed yet. */
  pending?: boolean;
  /** Hours until the streak lapses, shown as a warning. */
  expiresIn?: number;
  size?: 'sm' | 'md';
}

/**
 * The streak tracker: consecutive logins, wins or dailies, with milestone
 * markers along the way and a warning when the run is about to break.
 *
 *   const streak = new StreakMeter({
 *     value: 6, length: 7, milestones: [3, 7],
 *     unit: 'day streak', expiresIn: 5, pending: true,
 *   });
 *   streak.on('streak:claim', () => claimToday());
 *
 * The expiry warning is the working part: a streak with nothing at stake is
 * just a number, and a streak about to lapse is a reason to open the game.
 */
export class StreakMeter extends FuiComponent<StreakMeterOptions> {
  private pips: HTMLElement[] = [];
  private value: number;
  private countEl: HTMLElement;

  constructor(opts: StreakMeterOptions) {
    const root = h('div', { class: 'fui fui-streak', dataset: { size: opts.size ?? 'md' } });
    super(root, opts);

    const length = opts.length ?? 7;
    this.value = Math.max(0, opts.value);

    const head = h('div', { class: 'fui-streak__head' });
    const flame = h('span', { class: 'fui-streak__flame' });
    if (opts.glyph) flame.style.setProperty('--fui-glyph-src', `var(--fui-img-${opts.glyph})`);
    head.appendChild(flame);
    this.countEl = h('span', { class: 'fui-streak__count fui-num' });
    head.appendChild(this.countEl);
    head.appendChild(h('span', { class: 'fui-streak__unit', text: opts.unit ?? 'day streak' }));
    root.appendChild(head);

    const track = h('div', { class: 'fui-streak__track' });
    for (let i = 1; i <= length; i++) {
      const pip = h('span', {
        class: 'fui-streak__pip',
        attrs: { title: `${opts.unit ?? 'Day'} ${i}` },
      });
      if (opts.milestones?.includes(i)) pip.classList.add('is-milestone');
      this.pips.push(pip);
      track.appendChild(pip);
    }
    root.appendChild(track);

    const foot = h('div', { class: 'fui-streak__foot' });
    if (opts.expiresIn != null) {
      foot.appendChild(
        h('span', {
          class: 'fui-streak__expiry',
          text: `Resets in ${opts.expiresIn}h`,
          dataset: { urgent: String(opts.expiresIn <= 6) },
        }),
      );
    }
    if (opts.pending) {
      const btn = h('button', {
        class: 'fui-streak__claim',
        text: 'Claim today',
        attrs: { type: 'button' },
      });
      btn.addEventListener('click', () => this.emit('streak:claim', this.value + 1));
      foot.appendChild(btn);
    }
    if (foot.childNodes.length) root.appendChild(foot);

    this.paint();
  }

  get(): number {
    return this.value;
  }

  /** Extend the streak by one and light the next pip. */
  advance(): this {
    return this.set(this.value + 1);
  }

  /** Break the streak back to zero. */
  reset(): this {
    const had = this.value;
    this.value = 0;
    this.paint();
    if (had > 0) this.emit('streak:break', had);
    return this;
  }

  set(value: number, opts?: { silent?: boolean }): this {
    this.value = Math.max(0, value);
    this.paint();
    if (!opts?.silent) this.emit('streak:change', this.value);
    if (this.opts.milestones?.includes(this.value)) this.emit('streak:milestone', this.value);
    return this;
  }

  private paint(): void {
    const length = this.pips.length;
    // Past the end of the track the pips wrap, so a 23-day streak on a 7-pip
    // track shows 2 lit rather than a full row that stops meaning anything.
    const within = this.value % length === 0 && this.value > 0 ? length : this.value % length;
    const lit = clamp(this.value >= length ? within : this.value, 0, length);
    this.pips.forEach((pip, i) => pip.classList.toggle('is-on', i < lit));
    this.countEl.textContent = String(this.value);
    this.el.classList.toggle('is-hot', this.value > 0);
  }
}
