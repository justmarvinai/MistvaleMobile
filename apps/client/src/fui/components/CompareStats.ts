// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface CompareRow {
  /** Stat name shown down the middle. */
  label: string;
  /** Current value. */
  from: number;
  /** Value after the change being previewed. */
  to: number;
  /** Append a unit, e.g. `'%'`. */
  suffix?: string;
  /** Set when a *lower* number is the better outcome — cooldowns, costs. */
  lowerIsBetter?: boolean;
  /** Glyph asset id before the label. */
  glyph?: string;
}

export interface CompareStatsOptions extends BaseOptions {
  rows: CompareRow[];
  /** Column heading over the current values. */
  fromLabel?: string;
  /** Column heading over the previewed values. */
  toLabel?: string;
  /** Hide rows whose value does not move. */
  changesOnly?: boolean;
  /** Draw a proportional bar behind each pair. */
  bars?: boolean;
}

/**
 * The before / after table every upgrade decision needs: equip this artifact,
 * level up, ascend, swap a gear set — what actually changes and by how much.
 *
 *   new CompareStats({
 *     fromLabel: 'Equipped', toLabel: 'New',
 *     rows: [
 *       { label: 'ATK', from: 1482, to: 1710 },
 *       { label: 'C.DMG', from: 90, to: 128, suffix: '%' },
 *       { label: 'Cooldown', from: 4, to: 3, lowerIsBetter: true },
 *     ],
 *   });
 *
 * `lowerIsBetter` matters more than it looks: a cooldown dropping is a gain,
 * and colouring it red because the number went down is the classic bug here.
 */
export class CompareStats extends FuiComponent<CompareStatsOptions> {
  private body: HTMLElement;

  constructor(opts: CompareStatsOptions) {
    const root = h('div', { class: 'fui fui-compare' });
    super(root, opts);

    const head = h('div', { class: 'fui-compare__head' });
    head.appendChild(h('span', { class: 'fui-compare__col fui-label', text: opts.fromLabel ?? 'Current' }));
    head.appendChild(h('span', { class: 'fui-compare__spacer' }));
    head.appendChild(h('span', { class: 'fui-compare__col fui-label', text: opts.toLabel ?? 'Preview' }));
    root.appendChild(head);

    this.body = h('div', { class: 'fui-compare__body' });
    root.appendChild(this.body);
    this.setRows(opts.rows);
  }

  setRows(rows: CompareRow[]): this {
    clear(this.body);
    const shown = this.opts.changesOnly ? rows.filter((r) => r.from !== r.to) : rows;

    for (const row of shown) {
      const delta = row.to - row.from;
      const better = row.lowerIsBetter ? delta < 0 : delta > 0;
      const dir = delta === 0 ? 'flat' : better ? 'up' : 'down';

      const el = h('div', { class: 'fui-compare__row', dataset: { dir } });
      if (this.opts.bars) {
        // Bars are scaled against the larger of the two so the pair always
        // fills the row and the eye compares lengths, not absolute widths.
        const peak = Math.max(Math.abs(row.from), Math.abs(row.to), 1);
        el.style.setProperty('--fui-cmp-from', String(Math.abs(row.from) / peak));
        el.style.setProperty('--fui-cmp-to', String(Math.abs(row.to) / peak));
        el.classList.add('has-bars');
      }

      el.appendChild(
        h('span', { class: 'fui-compare__from fui-num', text: commas(row.from) + (row.suffix ?? '') }),
      );

      const mid = h('div', { class: 'fui-compare__mid' });
      if (row.glyph) {
        mid.appendChild(
          h('span', {
            class: 'fui-compare__glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${row.glyph})` },
          }),
        );
      }
      mid.appendChild(h('span', { class: 'fui-compare__label', text: row.label }));
      el.appendChild(mid);

      const to = h('div', { class: 'fui-compare__to' });
      to.appendChild(
        h('span', { class: 'fui-compare__value fui-num', text: commas(row.to) + (row.suffix ?? '') }),
      );
      if (delta !== 0) {
        to.appendChild(
          h('span', {
            class: 'fui-compare__delta fui-num',
            text: `${delta > 0 ? '+' : '−'}${commas(Math.abs(delta))}${row.suffix ?? ''}`,
          }),
        );
      }
      el.appendChild(to);
      this.body.appendChild(el);
    }

    if (shown.length === 0) {
      this.body.appendChild(h('p', { class: 'fui-compare__none', text: 'Nothing changes.' }));
    }
    return this;
  }
}
