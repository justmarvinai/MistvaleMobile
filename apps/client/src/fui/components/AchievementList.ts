// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, clamp, commas } from '../core/dom.ts';

export interface AchievementRow {
  id: string;
  name: string;
  description?: string;
  /** Glyph asset id for the badge. */
  glyph?: string;
  /** Progress so far. */
  value?: number;
  /** Progress needed. */
  target?: number;
  /** Reward text, e.g. "300 gems". */
  reward?: string;
  /** Manifest asset id for the reward's art. */
  rewardArt?: string;
  /** Already collected. */
  claimed?: boolean;
  /** Tier within a chain, e.g. "III". */
  tier?: string;
  /** Points awarded toward an overall score. */
  points?: number;
}

export interface AchievementListOptions extends BaseOptions {
  achievements: AchievementRow[];
  title?: string;
  /** Cap the height in pixels (or any CSS length) and scroll inside. */
  maxHeight?: number | string;
  /** Show the total points banner. */
  showScore?: boolean;
  /** Move completed-but-unclaimed rows to the top. */
  claimableFirst?: boolean;
  emptyText?: string;
}

/**
 * The achievements screen: what is done, what is close, and what pays out.
 * `AchievementPopup` is the toast that fires on unlock; this is the ledger
 * behind it.
 *
 *   const list = new AchievementList({
 *     title: 'Achievements', showScore: true, claimableFirst: true,
 *     achievements: [
 *       { id: 'a1', name: 'Gate Breaker', description: 'Clear 50 stages',
 *         value: 50, target: 50, reward: '300 gems', points: 20 },
 *       { id: 'a2', name: 'Ascendant', description: 'Ascend a champion to 6★',
 *         value: 2, target: 5, reward: '1 Void Shard', points: 40 },
 *     ],
 *   });
 *   list.on<string>('achievement:claim', (id) => claim(id));
 *
 * Completed-but-unclaimed rows sort to the top by default, since an unclaimed
 * reward buried on page three is a reward nobody collects.
 */
export class AchievementList extends FuiComponent<AchievementListOptions> {
  private body: HTMLElement;
  private rows: AchievementRow[];
  private scoreEl: HTMLElement | null = null;

  constructor(opts: AchievementListOptions) {
    const root = h('div', { class: 'fui fui-achievements' });
    super(root, opts);
    this.rows = [...opts.achievements];

    if (opts.title || opts.showScore) {
      const head = h('div', { class: 'fui-achievements__head' });
      if (opts.title) {
        head.appendChild(
          h('span', { class: 'fui-achievements__title fui-label', text: opts.title }),
        );
      }
      if (opts.showScore) {
        this.scoreEl = h('span', { class: 'fui-achievements__score fui-num' });
        head.appendChild(this.scoreEl);
      }
      root.appendChild(head);
    }

    this.body = h('div', { class: 'fui-achievements__body fui-scroll' });
    if (opts.maxHeight != null) {
      this.body.style.maxHeight =
        typeof opts.maxHeight === 'number' ? `${opts.maxHeight}px` : opts.maxHeight;
    }
    root.appendChild(this.body);
    this.render();
  }

  /** Whether a row is finished but not yet collected. */
  private claimable(row: AchievementRow): boolean {
    return !row.claimed && (row.value ?? 0) >= (row.target ?? 1);
  }

  /** Ids of every achievement waiting to be collected. */
  getClaimable(): string[] {
    return this.rows.filter((r) => this.claimable(r)).map((r) => r.id);
  }

  /** Mark one as collected. */
  claim(id: string): this {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.claimed = true;
    this.render();
    return this;
  }

  setAchievements(achievements: AchievementRow[]): this {
    this.rows = [...achievements];
    this.render();
    return this;
  }

  private render(): void {
    clear(this.body);

    const sorted = this.opts.claimableFirst
      ? [...this.rows].sort((a, b) => Number(this.claimable(b)) - Number(this.claimable(a)))
      : this.rows;

    if (sorted.length === 0) {
      this.body.appendChild(
        h('p', {
          class: 'fui-achievements__empty',
          text: this.opts.emptyText ?? 'Nothing to show.',
        }),
      );
    }

    for (const row of sorted) {
      const target = row.target ?? 1;
      const value = clamp(row.value ?? 0, 0, target);
      const done = value >= target;
      const el = h('div', {
        class: 'fui-achievements__row',
        dataset: { state: row.claimed ? 'claimed' : done ? 'ready' : 'open' },
        style: { '--fui-ach-p': String(target ? value / target : 0) },
      });

      const badge = h('span', { class: 'fui-achievements__badge' });
      if (row.glyph) badge.style.setProperty('--fui-glyph-src', `var(--fui-img-${row.glyph})`);
      if (row.tier) badge.appendChild(h('span', { class: 'fui-achievements__tier', text: row.tier }));
      el.appendChild(badge);

      const main = h('div', { class: 'fui-achievements__main' });
      main.appendChild(h('span', { class: 'fui-achievements__name', text: row.name }));
      if (row.description) {
        main.appendChild(
          h('span', { class: 'fui-achievements__desc', text: row.description }),
        );
      }
      main.appendChild(
        h(
          'div',
          { class: 'fui-achievements__track' },
          h('span', { class: 'fui-achievements__fill' }),
          h('span', {
            class: 'fui-achievements__count fui-num',
            text: `${commas(value)} / ${commas(target)}`,
          }),
        ),
      );
      el.appendChild(main);

      const side = h('div', { class: 'fui-achievements__side' });
      if (row.reward) {
        const reward = h('div', { class: 'fui-achievements__reward' });
        if (row.rewardArt) {
          reward.appendChild(
            h('span', {
              class: 'fui-achievements__reward-art',
              style: { backgroundImage: `var(--fui-img-${row.rewardArt})` },
            }),
          );
        }
        reward.appendChild(h('span', { text: row.reward }));
        side.appendChild(reward);
      }
      if (row.points != null) {
        side.appendChild(
          h('span', { class: 'fui-achievements__points fui-num', text: `${row.points} pts` }),
        );
      }

      if (row.claimed) {
        side.appendChild(h('span', { class: 'fui-achievements__claimed', text: 'Claimed' }));
      } else if (done) {
        const btn = h('button', {
          class: 'fui-achievements__claim',
          text: 'Claim',
          attrs: { type: 'button' },
        });
        btn.addEventListener('click', () => this.emit('achievement:claim', row.id));
        side.appendChild(btn);
      }
      el.appendChild(side);

      this.body.appendChild(el);
    }

    if (this.scoreEl) {
      const earned = this.rows
        .filter((r) => r.claimed || this.claimable(r))
        .reduce((sum, r) => sum + (r.points ?? 0), 0);
      const total = this.rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
      this.scoreEl.textContent = `${commas(earned)} / ${commas(total)} pts`;
    }
  }
}
