// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface DailyReward {
  /** Icon or glyph asset id. */
  icon: string;
  label?: string;
  qty?: number;
  /** Bigger tile and gold trim — the streak payoff days. */
  milestone?: boolean;
}

export interface DailyRewardsOptions extends BaseOptions {
  rewards: DailyReward[];
  /** 1-based day the player is on. Earlier days count as collected. */
  currentDay?: number;
  /** Whether today's reward is still waiting. */
  claimedToday?: boolean;
  title?: string;
  subtitle?: string;
  /**
   * Grid tracks. Defaults to the number of tiles plus one extra per milestone,
   * since milestone tiles are double width and would otherwise wrap.
   */
  columns?: number;
}

/**
 * The login calendar: a grid of daily rewards with collected, claimable and
 * upcoming states, plus milestone days.
 *
 * Emits `daily:claim` with `{ day, reward }`.
 *
 *   const daily = new DailyRewards({ currentDay: 4, rewards: [...] });
 *   daily.on('daily:claim', ({ day }) => grantDay(day));
 */
export class DailyRewards extends FuiComponent<DailyRewardsOptions> {
  private gridEl: HTMLElement;
  private claimedToday: boolean;

  constructor(opts: DailyRewardsOptions) {
    const tracks =
      opts.columns ?? opts.rewards.length + opts.rewards.filter((r) => r.milestone).length;
    const root = h('div', {
      class: 'fui fui-daily',
      style: { '--fui-daily-cols': String(tracks) },
    });
    super(root, opts);
    this.claimedToday = !!opts.claimedToday;

    if (opts.title || opts.subtitle) {
      const head = h('header', { class: 'fui-daily__head' });
      if (opts.title) head.appendChild(h('h3', { class: 'fui-daily__title fui-title', text: opts.title }));
      if (opts.subtitle) head.appendChild(h('p', { class: 'fui-daily__sub fui-label', text: opts.subtitle }));
      root.appendChild(head);
    }

    this.gridEl = h('div', { class: 'fui-daily__grid' });
    root.appendChild(this.gridEl);
    this.render();
  }

  /** Claim the current day, if it is still outstanding. */
  claimToday(): boolean {
    const day = this.opts.currentDay ?? 1;
    if (this.claimedToday) return false;
    this.claimedToday = true;
    this.render();
    this.emit('daily:claim', { day, reward: this.opts.rewards[day - 1] });
    return true;
  }

  private render(): void {
    clear(this.gridEl);
    const current = this.opts.currentDay ?? 1;

    this.opts.rewards.forEach((reward, i) => {
      const day = i + 1;
      const state =
        day < current || (day === current && this.claimedToday)
          ? 'collected'
          : day === current
            ? 'ready'
            : 'upcoming';

      const cell = h('button', {
        class: 'fui-daily__cell',
        dataset: { state },
        attrs: { type: 'button', title: reward.label, disabled: state !== 'ready' },
      });
      if (reward.milestone) cell.classList.add('is-milestone');

      cell.appendChild(h('span', { class: 'fui-daily__day', text: `Day ${day}` }));
      cell.appendChild(
        h('span', { class: 'fui-daily__icon', style: { backgroundImage: `var(--fui-img-${reward.icon})` } }),
      );
      if (reward.qty) {
        cell.appendChild(h('span', { class: 'fui-daily__qty fui-num', text: `×${commas(reward.qty)}` }));
      }
      cell.addEventListener('click', () => {
        if (state === 'ready') this.claimToday();
      });
      this.gridEl.appendChild(cell);
    });
  }
}
