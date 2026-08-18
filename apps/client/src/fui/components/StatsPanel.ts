// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface StatRow {
  id: string;
  label: string;
  value: number | string;
  /** Bonus from gear/buffs, rendered as a green `+12`. */
  bonus?: number;
  /** Short explanation shown under the row. */
  hint?: string;
  /** Show +/- buttons for spending points on this attribute. */
  allocatable?: boolean;
  icon?: string;
}

export interface StatGroup {
  label: string;
  rows: StatRow[];
}

export interface StatsPanelOptions extends BaseOptions {
  title?: string;
  groups: StatGroup[];
  /** Unspent attribute points; enables the +/- controls when above zero. */
  points?: number;
  /** Width in pixels. */
  width?: number;
}

/**
 * The character sheet: grouped attribute rows with gear bonuses and optional
 * point allocation.
 *
 * Emits `stats:allocate` with `{ id, delta }` whenever a point is spent.
 *
 *   const sheet = new StatsPanel({ points: 3, groups: [
 *     { label: 'Attributes', rows: [
 *       { id: 'str', label: 'Strength', value: 24, bonus: 6, allocatable: true },
 *     ]},
 *   ]});
 */
export class StatsPanel extends FuiComponent<StatsPanelOptions> {
  private bodyEl: HTMLElement;
  private pointsEl: HTMLElement | null = null;
  private points: number;

  constructor(opts: StatsPanelOptions) {
    const root = h('div', {
      class: 'fui fui-stats',
      style: { width: `${opts.width ?? 340}px` },
    });
    super(root, opts);
    this.points = opts.points ?? 0;

    root.appendChild(h('div', { class: 'fui-stats__fill', attrs: { 'aria-hidden': 'true' } }));

    const head = h('header', { class: 'fui-stats__head' });
    head.appendChild(
      h('h2', { class: 'fui-stats__title fui-title', text: opts.title ?? 'Character' }),
    );
    if (opts.points != null) {
      this.pointsEl = h('span', { class: 'fui-stats__points fui-num' });
      head.appendChild(
        h('span', { class: 'fui-stats__pointsbox' }, h('span', { class: 'fui-label', text: 'Points' }), this.pointsEl),
      );
    }
    root.appendChild(head);

    this.bodyEl = h('div', { class: 'fui-stats__body fui-scroll' });
    root.appendChild(this.bodyEl);
    this.render();
  }

  /** Set the unspent point pool. */
  setPoints(points: number): this {
    this.points = points;
    this.render();
    return this;
  }

  /** Update one stat's base value. */
  setValue(id: string, value: number | string): this {
    for (const g of this.opts.groups) {
      const row = g.rows.find((r) => r.id === id);
      if (row) row.value = value;
    }
    this.render();
    return this;
  }

  private render(): void {
    clear(this.bodyEl);
    if (this.pointsEl) this.pointsEl.textContent = String(this.points);

    for (const group of this.opts.groups) {
      this.bodyEl.appendChild(h('h3', { class: 'fui-stats__group fui-label', text: group.label }));
      const list = h('ul', { class: 'fui-stats__list' });

      for (const row of group.rows) {
        const li = h('li', { class: 'fui-stats__row' });

        if (row.icon) {
          li.appendChild(
            h('span', {
              class: 'fui-stats__icon',
              style: { backgroundImage: `var(--fui-img-${row.icon})` },
            }),
          );
        }
        li.appendChild(
          h(
            'span',
            { class: 'fui-stats__labelcol' },
            h('span', { class: 'fui-stats__label', text: row.label }),
            row.hint && h('span', { class: 'fui-stats__hint', text: row.hint }),
          ),
        );

        const valueBox = h('span', { class: 'fui-stats__valuebox' });
        valueBox.appendChild(
          h('span', {
            class: 'fui-stats__value fui-num',
            text: typeof row.value === 'number' ? commas(row.value) : row.value,
          }),
        );
        if (row.bonus) {
          valueBox.appendChild(
            h('span', {
              class: `fui-stats__bonus fui-num ${row.bonus < 0 ? 'is-negative' : ''}`,
              text: `${row.bonus > 0 ? '+' : ''}${row.bonus}`,
            }),
          );
        }
        li.appendChild(valueBox);

        if (row.allocatable) {
          const plus = h('button', {
            class: 'fui-stats__alloc',
            attrs: { type: 'button', disabled: this.points <= 0, 'aria-label': `Increase ${row.label}` },
            text: '+',
          });
          plus.addEventListener('click', () => {
            if (this.points <= 0) return;
            this.points--;
            if (typeof row.value === 'number') row.value += 1;
            this.render();
            this.emit('stats:allocate', { id: row.id, delta: 1 });
          });
          li.appendChild(plus);
        }
        list.appendChild(li);
      }
      this.bodyEl.appendChild(list);
    }
  }
}
