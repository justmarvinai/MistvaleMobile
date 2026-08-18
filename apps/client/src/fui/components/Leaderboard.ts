// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  /** Portrait / avatar URL. */
  avatar?: string;
  /** Class or faction icon asset id. */
  icon?: string;
  level?: number;
  /** Extra column, e.g. guild name or clear time. */
  detail?: string;
  /** Highlight this row as the local player. */
  you?: boolean;
  /** Movement since the last update, e.g. `+3` or `-1`. */
  change?: number;
}

export interface LeaderboardOptions extends BaseOptions {
  title?: string;
  entries: LeaderboardEntry[];
  /** Column heading for the score, e.g. `'Score'`, `'Time'`, `'Rating'`. */
  scoreLabel?: string;
  /** Format the score column; defaults to thousands separators. */
  format?: (score: number) => string;
  /** Width in pixels. */
  width?: number;
  /** Pin the player's own row to the bottom when they're off the visible list. */
  pinYou?: boolean;
}

/**
 * Ranked table for high scores, arena ladders, raid clears and weekly events.
 * The top three take gold, silver and bronze treatments.
 *
 * Emits `board:select` with the clicked entry.
 *
 *   new Leaderboard({ title: 'Arena Ladder', scoreLabel: 'Rating',
 *     entries: [{ rank: 1, name: 'Vex', score: 2840, change: 2 }] });
 */
export class Leaderboard extends FuiComponent<LeaderboardOptions> {
  private bodyEl: HTMLElement;

  constructor(opts: LeaderboardOptions) {
    const root = h('div', {
      class: 'fui fui-board',
      style: { width: `${opts.width ?? 420}px` },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-board__fill', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(
      h('h2', { class: 'fui-board__title fui-title', text: opts.title ?? 'Leaderboard' }),
    );
    root.appendChild(
      h(
        'div',
        { class: 'fui-board__head' },
        h('span', { class: 'fui-board__hrank', text: '#' }),
        h('span', { class: 'fui-board__hname', text: 'Player' }),
        h('span', { class: 'fui-board__hscore', text: opts.scoreLabel ?? 'Score' }),
      ),
    );

    this.bodyEl = h('div', { class: 'fui-board__body fui-scroll' });
    root.appendChild(this.bodyEl);
    this.render();
  }

  setEntries(entries: LeaderboardEntry[]): this {
    this.opts.entries = entries;
    this.render();
    return this;
  }

  private row(e: LeaderboardEntry, pinned = false): HTMLElement {
    const fmt = this.opts.format ?? commas;
    const row = h('button', {
      class: 'fui-board__row',
      attrs: { type: 'button' },
      dataset: e.rank <= 3 ? { medal: String(e.rank) } : undefined,
    });
    if (e.you) row.classList.add('is-you');
    if (pinned) row.classList.add('is-pinned');

    row.appendChild(h('span', { class: 'fui-board__rank fui-num', text: String(e.rank) }));

    const who = h('span', { class: 'fui-board__who' });
    if (e.avatar) {
      who.appendChild(
        h('span', { class: 'fui-board__avatar', style: { backgroundImage: `url("${e.avatar}")` } }),
      );
    } else if (e.icon) {
      who.appendChild(
        h('span', {
          class: 'fui-board__avatar is-icon',
          style: { backgroundImage: `var(--fui-img-${e.icon})` },
        }),
      );
    }
    who.appendChild(
      h(
        'span',
        { class: 'fui-board__names' },
        h('span', { class: 'fui-board__name', text: e.name }),
        (e.detail || e.level != null) &&
          h('span', {
            class: 'fui-board__detail',
            text: [e.level != null ? `Lv ${e.level}` : null, e.detail].filter(Boolean).join(' · '),
          }),
      ),
    );
    row.appendChild(who);

    const score = h('span', { class: 'fui-board__scorecol' });
    score.appendChild(h('span', { class: 'fui-board__score fui-num', text: fmt(e.score) }));
    if (e.change) {
      score.appendChild(
        h('span', {
          class: `fui-board__change ${e.change > 0 ? 'is-up' : 'is-down'}`,
          text: `${e.change > 0 ? '▲' : '▼'}${Math.abs(e.change)}`,
        }),
      );
    }
    row.appendChild(score);

    row.addEventListener('click', () => this.emit('board:select', e));
    return row;
  }

  private render(): void {
    clear(this.bodyEl);
    for (const e of this.opts.entries) this.bodyEl.appendChild(this.row(e));

    if (this.opts.pinYou) {
      const you = this.opts.entries.find((e) => e.you);
      if (you) {
        this.el.querySelector('.fui-board__pinned')?.remove();
        const pinned = h('div', { class: 'fui-board__pinned' }, this.row(you, true));
        this.el.appendChild(pinned);
      }
    }
  }
}
