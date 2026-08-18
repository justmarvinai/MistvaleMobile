// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface PityTrack {
  /** What the guarantee gives — "Legendary", "Rate-up champion". */
  label: string;
  /** Pulls since the last one. */
  current: number;
  /** Pulls at which it is guaranteed. */
  guaranteed: number;
  /** Pull count at which the odds start climbing. */
  softStart?: number;
  color?: string;
}

export interface PityCounterOptions extends BaseOptions {
  tracks: PityTrack[];
  /** Heading over the tracks. */
  title?: string;
  /** Print "N pulls to guarantee" under each track. */
  showRemaining?: boolean;
  compact?: boolean;
}

/**
 * The mercy counter: how many pulls until the game owes you something. Games
 * that show this convert better than games that hide it, because a visible
 * guarantee turns a gamble into a countdown.
 *
 *   const pity = new PityCounter({
 *     title: 'Mercy',
 *     tracks: [
 *       { label: 'Legendary', current: 62, guaranteed: 100, softStart: 75, color: 'var(--fui-rarity-legendary)' },
 *       { label: 'Rate-up', current: 3, guaranteed: 2 },
 *     ],
 *   });
 *   pity.pull();   // advances every track by one
 *
 * `softStart` marks where the rate begins climbing, drawn as a notch — the
 * detail that makes the bar honest rather than decorative.
 */
export class PityCounter extends FuiComponent<PityCounterOptions> {
  private tracks: PityTrack[];
  private fills: HTMLElement[] = [];
  private counts: HTMLElement[] = [];
  private notes: HTMLElement[] = [];

  constructor(opts: PityCounterOptions) {
    const root = h('div', { class: 'fui fui-pity' });
    if (opts.compact) root.classList.add('fui-pity--compact');
    super(root, opts);
    this.tracks = opts.tracks.map((t) => ({ ...t }));

    if (opts.title) {
      root.appendChild(h('p', { class: 'fui-pity__title fui-label', text: opts.title }));
    }

    for (const track of this.tracks) {
      const el = h('div', {
        class: 'fui-pity__track',
        style: track.color ? { '--fui-pity-ink': track.color } : {},
      });

      const head = h('div', { class: 'fui-pity__head' });
      head.appendChild(h('span', { class: 'fui-pity__label', text: track.label }));
      const count = h('span', { class: 'fui-pity__count fui-num' });
      head.appendChild(count);
      this.counts.push(count);
      el.appendChild(head);

      const fill = h('span', { class: 'fui-pity__fill' });
      const bar = h('div', { class: 'fui-pity__bar' }, fill);
      if (track.softStart != null && track.softStart < track.guaranteed) {
        bar.appendChild(
          h('span', {
            class: 'fui-pity__soft',
            style: { left: `${(track.softStart / track.guaranteed) * 100}%` },
            attrs: { title: `Rate climbs from pull ${track.softStart}` },
          }),
        );
      }
      this.fills.push(fill);
      el.appendChild(bar);

      const note = h('span', { class: 'fui-pity__note' });
      this.notes.push(note);
      if (opts.showRemaining ?? true) el.appendChild(note);

      root.appendChild(el);
    }
    this.paint();
  }

  /** Advance every track by `n` pulls. */
  pull(n = 1): this {
    for (const track of this.tracks) track.current += n;
    this.paint();
    this.emit('pity:pull', this.tracks.map((t) => t.current));
    return this;
  }

  /** Reset one track by label — call when its guarantee actually fires. */
  reset(label: string): this {
    const track = this.tracks.find((t) => t.label === label);
    if (!track) return this;
    track.current = 0;
    this.paint();
    this.emit('pity:reset', label);
    return this;
  }

  /** Set one track's counter directly, e.g. when rehydrating from the server. */
  set(label: string, current: number): this {
    const track = this.tracks.find((t) => t.label === label);
    if (!track) return this;
    track.current = Math.max(0, current);
    this.paint();
    return this;
  }

  private paint(): void {
    this.tracks.forEach((track, i) => {
      const pct = clamp(track.current / Math.max(1, track.guaranteed), 0, 1);
      const soft = track.softStart != null && track.current >= track.softStart;
      const due = track.current >= track.guaranteed;
      this.fills[i].style.width = `${(pct * 100).toFixed(2)}%`;
      this.fills[i].parentElement?.classList.toggle('is-soft', soft && !due);
      this.fills[i].parentElement?.classList.toggle('is-due', due);
      this.counts[i].textContent = `${commas(track.current)} / ${commas(track.guaranteed)}`;
      const left = Math.max(0, track.guaranteed - track.current);
      this.notes[i].textContent = due
        ? 'Guaranteed on the next pull'
        : `${commas(left)} ${left === 1 ? 'pull' : 'pulls'} to guarantee`;
    });
  }
}
