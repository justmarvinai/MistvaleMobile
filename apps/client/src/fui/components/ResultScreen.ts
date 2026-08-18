// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';
import { Button } from './Button.ts';

export interface ResultStat {
  label: string;
  value: string | number;
  /** Highlights the standout line, e.g. a new personal best. */
  best?: boolean;
}

export interface ResultReward {
  icon: string;
  label?: string;
  qty?: number;
}

export interface ResultScreenOptions extends BaseOptions {
  /** `victory` gets gold treatment, `defeat` red, `neutral` stays quiet. */
  outcome?: 'victory' | 'defeat' | 'neutral';
  /** Big headline. Defaults to Victory / Defeat by outcome. */
  title?: string;
  /** Line under the headline, e.g. the encounter's name. */
  subtitle?: string;
  stats?: ResultStat[];
  rewards?: ResultReward[];
  xp?: number;
  gold?: number;
  /** Star rating out of three, as many games use for level clears. */
  stars?: number;
  actions?: { id: string; label: string; primary?: boolean }[];
  fullscreen?: boolean;
}

/**
 * The end-of-run screen: victory or defeat headline, a stat table, star rating,
 * reward chips and continue actions.
 *
 * Emits `result:action` with the chosen action id.
 *
 *   new ResultScreen({ outcome: 'victory', subtitle: 'The Sunken Gate',
 *     stars: 2, xp: 4200, gold: 860,
 *     stats: [{ label: 'Time', value: '6:42', best: true }],
 *     actions: [{ id: 'next', label: 'Continue', primary: true }] });
 */
export class ResultScreen extends FuiComponent<ResultScreenOptions> {
  constructor(opts: ResultScreenOptions = {}) {
    const outcome = opts.outcome ?? 'victory';
    const root = h('div', { class: 'fui fui-result', dataset: { outcome } });
    if (opts.fullscreen !== false) root.classList.add('fui-result--fullscreen');
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-result__bg', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(h('div', { class: 'fui-result__rays', attrs: { 'aria-hidden': 'true' } }));

    const card = h('div', { class: 'fui-result__card' });

    card.appendChild(
      h('h1', {
        class: 'fui-result__title fui-title',
        text: opts.title ?? (outcome === 'defeat' ? 'Defeat' : outcome === 'victory' ? 'Victory' : 'Complete'),
      }),
    );
    if (opts.subtitle) {
      card.appendChild(h('p', { class: 'fui-result__subtitle', text: opts.subtitle }));
    }

    if (opts.stars != null) {
      const stars = h('div', { class: 'fui-result__stars' });
      for (let i = 0; i < 3; i++) {
        const s = h('span', { class: 'fui-result__star', style: { animationDelay: `${i * 180}ms` } });
        if (i < opts.stars) s.classList.add('is-earned');
        stars.appendChild(s);
      }
      card.appendChild(stars);
    }

    card.appendChild(h('div', { class: 'fui-result__rule', attrs: { 'aria-hidden': 'true' } }));

    if (opts.stats?.length) {
      const table = h('dl', { class: 'fui-result__stats' });
      for (const s of opts.stats) {
        const dt = h('dt', { text: s.label });
        const dd = h('dd', {
          class: `fui-num${s.best ? ' is-best' : ''}`,
          text: typeof s.value === 'number' ? commas(s.value) : s.value,
        });
        table.append(dt, dd);
      }
      card.appendChild(table);
    }

    if (opts.xp || opts.gold || opts.rewards?.length) {
      const rewards = h('div', { class: 'fui-result__rewards' });
      if (opts.xp) {
        rewards.appendChild(
          h('span', { class: 'fui-result__chip is-xp', text: `+${commas(opts.xp)} XP` }),
        );
      }
      if (opts.gold) {
        rewards.appendChild(
          h(
            'span',
            { class: 'fui-result__chip is-gold' },
            h('span', { class: 'fui-result__coin', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'fui-num', text: `+${commas(opts.gold)}` }),
          ),
        );
      }
      for (const r of opts.rewards ?? []) {
        rewards.appendChild(
          h(
            'span',
            { class: 'fui-result__chip', attrs: { title: r.label } },
            h('span', {
              class: 'fui-result__ricon',
              style: { backgroundImage: `var(--fui-img-${r.icon})` },
            }),
            r.qty && r.qty > 1 ? h('span', { class: 'fui-num', text: `x${r.qty}` }) : null,
          ),
        );
      }
      card.appendChild(rewards);
    }

    const actions = h('div', { class: 'fui-result__actions' });
    for (const a of opts.actions ?? [{ id: 'continue', label: 'Continue', primary: true }]) {
      actions.appendChild(
        new Button({
          label: a.label,
          variant: a.primary ? 'primary' : 'ghost',
          size: a.primary ? 'lg' : 'md',
          onClick: () => this.emit('result:action', { id: a.id }),
        }).el,
      );
    }
    card.appendChild(actions);
    root.appendChild(card);
  }
}
