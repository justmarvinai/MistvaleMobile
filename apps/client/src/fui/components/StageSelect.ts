// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { StarRating } from './StarRating.ts';

export interface Stage {
  id: string;
  label: string;
  /** Clear rating out of three. */
  stars?: number;
  /** `locked` cannot be entered, `current` is the next objective. */
  state?: 'locked' | 'open' | 'cleared' | 'current';
  /** Energy cost shown on the node. */
  cost?: number;
  /** Marks a boss or elite node. */
  boss?: boolean;
  /** Glyph or icon asset id drawn inside the node. */
  icon?: string;
}

export interface StageSelectOptions extends BaseOptions {
  stages: Stage[];
  title?: string;
  /** Chapter caption under the title. */
  subtitle?: string;
  /** `path` snakes the nodes like a campaign map; `grid` is a plain matrix. */
  layout?: 'path' | 'grid';
  columns?: number;
}

/**
 * The campaign map: a run of stage nodes with clear ratings, lock state and
 * energy costs, joined by a progress path.
 *
 * Emits `stage:select` for any enterable node.
 *
 *   new StageSelect({ title: 'Chapter 4', stages: [
 *     { id: '4-1', label: '1', stars: 3, state: 'cleared' },
 *     { id: '4-2', label: '2', state: 'current', cost: 8 },
 *     { id: '4-3', label: '3', state: 'locked', boss: true },
 *   ]});
 */
export class StageSelect extends FuiComponent<StageSelectOptions> {
  private listEl: HTMLElement;

  constructor(opts: StageSelectOptions) {
    const root = h('div', {
      class: 'fui fui-stages',
      dataset: { layout: opts.layout ?? 'path' },
      style: { '--fui-stage-cols': String(opts.columns ?? 5) },
    });
    super(root, opts);

    if (opts.title || opts.subtitle) {
      const head = h('header', { class: 'fui-stages__head' });
      if (opts.title) head.appendChild(h('h2', { class: 'fui-stages__title fui-title', text: opts.title }));
      if (opts.subtitle) head.appendChild(h('p', { class: 'fui-stages__sub fui-label', text: opts.subtitle }));
      root.appendChild(head);
    }

    this.listEl = h('div', { class: 'fui-stages__list' });
    root.appendChild(this.listEl);
    this.render();
  }

  setStages(stages: Stage[]): this {
    this.opts.stages = stages;
    this.render();
    return this;
  }

  /** Total stars earned across every stage. */
  get earnedStars(): number {
    return this.opts.stages.reduce((n, s) => n + (s.stars ?? 0), 0);
  }

  private render(): void {
    clear(this.listEl);

    for (const stage of this.opts.stages) {
      const state = stage.state ?? 'open';
      const node = h('button', {
        class: 'fui-stages__node',
        dataset: { state },
        attrs: {
          type: 'button',
          disabled: state === 'locked',
          'aria-label': `Stage ${stage.label}`,
        },
      });
      if (stage.boss) node.classList.add('is-boss');

      const disc = h('span', { class: 'fui-stages__disc' });
      if (stage.icon) {
        disc.appendChild(
          h('span', {
            class: 'fui-stages__icon',
            style: { '--fui-glyph-src': `var(--fui-img-${stage.icon})` },
          }),
        );
      } else {
        disc.appendChild(h('span', { class: 'fui-stages__num', text: stage.label }));
      }
      node.appendChild(disc);

      if (state !== 'locked' && stage.stars != null) {
        node.appendChild(new StarRating({ value: stage.stars, max: 3, variant: 'stage', size: 12 }).el);
      }
      if (stage.cost != null && state !== 'locked') {
        node.appendChild(h('span', { class: 'fui-stages__cost fui-num', text: `⚡${stage.cost}` }));
      }

      node.addEventListener('click', () => {
        if (state === 'locked') return;
        this.emit('stage:select', stage);
      });
      this.listEl.appendChild(node);
    }
  }
}
