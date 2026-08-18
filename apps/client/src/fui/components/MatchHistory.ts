// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface MatchRecord {
  id?: string;
  /** Outcome of the match. */
  result: 'win' | 'loss' | 'draw';
  /** Who was fought. */
  opponent: string;
  /** Avatar asset id for the opponent. */
  art?: string;
  /** Rating change, signed. */
  delta?: number;
  /** Relative time, e.g. "12m ago". */
  time?: string;
  /** Mode or bracket, e.g. "Classic Arena". */
  mode?: string;
  /** The squad fielded, as manifest asset ids. */
  team?: string[];
  /** Show a replay button; emits `match:replay`. */
  replayable?: boolean;
}

export interface MatchHistoryOptions extends BaseOptions {
  matches: MatchRecord[];
  /** Heading over the list. */
  title?: string;
  /** Cap the height and scroll inside. */
  maxHeight?: number | string;
  /** Print a W/L summary row at the top. */
  summary?: boolean;
  emptyText?: string;
}

/**
 * Recent battles — result, opponent, rating swing and the team that was
 * fielded. The screen a player checks after an arena session to work out which
 * defence keeps losing.
 *
 *   const history = new MatchHistory({
 *     title: 'Recent battles', summary: true, maxHeight: 320,
 *     matches: [
 *       { result: 'win', opponent: 'Ashvale', delta: 24, time: '12m ago', team: ['blood-necromancer'] },
 *       { result: 'loss', opponent: 'Hollowlight', delta: -11, time: '1h ago' },
 *     ],
 *   });
 *   history.on<string>('match:replay', (id) => playReplay(id));
 *
 * The summary row is computed from the records rather than passed in, so it can
 * never disagree with the list under it.
 */
export class MatchHistory extends FuiComponent<MatchHistoryOptions> {
  private body: HTMLElement;
  private summaryEl: HTMLElement | null = null;
  private matches: MatchRecord[];

  constructor(opts: MatchHistoryOptions) {
    const root = h('div', { class: 'fui fui-matches' });
    super(root, opts);
    this.matches = [...opts.matches];

    if (opts.title || opts.summary) {
      const head = h('div', { class: 'fui-matches__head' });
      if (opts.title) {
        head.appendChild(h('span', { class: 'fui-matches__title fui-label', text: opts.title }));
      }
      if (opts.summary) {
        this.summaryEl = h('span', { class: 'fui-matches__summary fui-num' });
        head.appendChild(this.summaryEl);
      }
      root.appendChild(head);
    }

    this.body = h('div', { class: 'fui-matches__body fui-scroll' });
    if (opts.maxHeight != null) {
      this.body.style.maxHeight =
        typeof opts.maxHeight === 'number' ? `${opts.maxHeight}px` : opts.maxHeight;
    }
    root.appendChild(this.body);
    this.render();
  }

  /** Prepend a freshly finished match. */
  push(match: MatchRecord): this {
    this.matches.unshift(match);
    this.render();
    return this;
  }

  setMatches(matches: MatchRecord[]): this {
    this.matches = [...matches];
    this.render();
    return this;
  }

  /** Win / loss / draw tallies computed from the records themselves. */
  tally(): { win: number; loss: number; draw: number } {
    return {
      win: this.matches.filter((m) => m.result === 'win').length,
      loss: this.matches.filter((m) => m.result === 'loss').length,
      draw: this.matches.filter((m) => m.result === 'draw').length,
    };
  }

  private render(): void {
    clear(this.body);

    if (this.matches.length === 0) {
      this.body.appendChild(
        h('p', {
          class: 'fui-matches__empty',
          text: this.opts.emptyText ?? 'No battles yet.',
        }),
      );
    }

    this.matches.forEach((match, i) => {
      const row = h('div', { class: 'fui-matches__row', dataset: { result: match.result } });

      row.appendChild(
        h('span', {
          class: 'fui-matches__result',
          text: match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D',
        }),
      );

      const art = h('span', { class: 'fui-matches__art' });
      if (match.art) art.style.backgroundImage = `var(--fui-img-${match.art})`;
      row.appendChild(art);

      const main = h('div', { class: 'fui-matches__main' });
      main.appendChild(h('span', { class: 'fui-matches__opponent', text: match.opponent }));
      const meta = h('div', { class: 'fui-matches__meta' });
      if (match.mode) meta.appendChild(h('span', { text: match.mode }));
      if (match.time) meta.appendChild(h('span', { text: match.time }));
      if (meta.childNodes.length) main.appendChild(meta);
      row.appendChild(main);

      if (match.team?.length) {
        const team = h('div', { class: 'fui-matches__team' });
        for (const art2 of match.team) {
          team.appendChild(
            h('span', {
              class: 'fui-matches__unit',
              style: { backgroundImage: `var(--fui-img-${art2})` },
            }),
          );
        }
        row.appendChild(team);
      }

      if (match.delta != null) {
        row.appendChild(
          h('span', {
            class: 'fui-matches__delta fui-num',
            text: `${match.delta > 0 ? '+' : match.delta < 0 ? '−' : ''}${commas(Math.abs(match.delta))}`,
          }),
        );
      }

      if (match.replayable) {
        const btn = h('button', {
          class: 'fui-matches__replay',
          text: 'Replay',
          attrs: { type: 'button' },
        });
        btn.addEventListener('click', () => this.emit('match:replay', match.id ?? String(i)));
        row.appendChild(btn);
      }

      this.body.appendChild(row);
    });

    if (this.summaryEl) {
      const { win, loss, draw } = this.tally();
      const played = win + loss + draw;
      const rate = played ? Math.round((win / played) * 100) : 0;
      this.summaryEl.textContent = `${win}W ${loss}L${draw ? ` ${draw}D` : ''} · ${rate}%`;
    }
  }
}
