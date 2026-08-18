// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clear, commas, abbreviate } from '../core/dom.ts';

export interface ChampionRow {
  id: string;
  name: string;
  /** Manifest asset id used as the portrait. */
  art?: string;
  /** Or an explicit image URL. */
  portrait?: string;
  rarity?: Rarity;
  stars?: number;
  level?: number;
  maxLevel?: number;
  /** Affinity colour swatch on the left edge. */
  affinityColor?: string;
  /** Glyph asset id for the role pip. */
  role?: string;
  power?: number;
  /** Padlock — reserved in another team, or locked against selling. */
  locked?: boolean;
  /** Dim the row and block selection. */
  disabled?: boolean;
  /** Extra right-hand text — "In Arena team", "Ascended". */
  note?: string;
}

export interface ChampionListOptions extends BaseOptions {
  rows: ChampionRow[];
  /** Ids selected on construction. */
  selected?: string[];
  /** `single`, `multi`, or `none` to make the list read-only. */
  select?: 'single' | 'multi' | 'none';
  /** Cap the height and scroll inside — the usual case for a full roster. */
  maxHeight?: number | string;
  /** Compact rows for a sidebar. */
  dense?: boolean;
  /** Shown in place of the list when `rows` is empty. */
  emptyText?: string;
}

/**
 * The dense roster list — the view a collection game shows when the card grid
 * is too big to scan: one line per champion, portrait, stars, level and power,
 * sortable and selectable.
 *
 *   const roster = new ChampionList({
 *     rows: champions,
 *     select: 'multi',
 *     maxHeight: 420,
 *   });
 *   roster.on<string[]>('roster:select', (ids) => sacrificePanel.set(ids));
 *
 * `setRows` swaps the data without rebuilding the component, which is what the
 * filter and sort bars above it call on every change.
 */
export class ChampionList extends FuiComponent<ChampionListOptions> {
  private body: HTMLElement;
  private chosen = new Set<string>();
  private rows: ChampionRow[];

  constructor(opts: ChampionListOptions) {
    const root = h('div', { class: 'fui fui-roster' });
    if (opts.dense) root.classList.add('fui-roster--dense');
    super(root, opts);

    this.rows = opts.rows;
    for (const id of opts.selected ?? []) this.chosen.add(id);

    this.body = h('div', { class: 'fui-roster__body fui-scroll' });
    if (opts.maxHeight != null) {
      this.body.style.maxHeight =
        typeof opts.maxHeight === 'number' ? `${opts.maxHeight}px` : opts.maxHeight;
    }
    root.appendChild(this.body);
    this.render();
  }

  /** Replace the rows in place — what a filter or sort change calls. */
  setRows(rows: ChampionRow[]): this {
    this.rows = rows;
    // Drop selections that are no longer visible, so the emitted set never
    // names a champion the player cannot see.
    const ids = new Set(rows.map((r) => r.id));
    for (const id of [...this.chosen]) if (!ids.has(id)) this.chosen.delete(id);
    this.render();
    return this;
  }

  /** Ids currently selected, in list order. */
  getSelected(): string[] {
    return this.rows.filter((r) => this.chosen.has(r.id)).map((r) => r.id);
  }

  select(id: string, opts?: { silent?: boolean }): this {
    const mode = this.opts.select ?? 'single';
    if (mode === 'none') return this;
    if (mode === 'single') {
      this.chosen.clear();
      this.chosen.add(id);
    } else if (this.chosen.has(id)) this.chosen.delete(id);
    else this.chosen.add(id);
    this.paintSelection();
    if (!opts?.silent) this.emit('roster:select', this.getSelected());
    return this;
  }

  private render(): void {
    clear(this.body);
    if (this.rows.length === 0) {
      this.body.appendChild(
        h('p', {
          class: 'fui-roster__empty',
          text: this.opts.emptyText ?? 'No champions match those filters.',
        }),
      );
      return;
    }

    for (const row of this.rows) {
      const el = h('div', {
        class: 'fui-roster__row',
        dataset: { id: row.id, rarity: row.rarity ?? 'common' },
        attrs: {
          role: this.opts.select === 'none' ? undefined : 'button',
          tabindex: this.opts.select === 'none' || row.disabled ? undefined : 0,
        },
      });
      if (row.disabled) el.classList.add('is-disabled');
      if (row.affinityColor) el.style.setProperty('--fui-roster-affinity', row.affinityColor);

      const art = h('span', { class: 'fui-roster__art', attrs: { 'aria-hidden': 'true' } });
      if (row.portrait) art.style.backgroundImage = `url("${row.portrait}")`;
      else if (row.art) art.style.backgroundImage = `var(--fui-img-${row.art})`;
      el.appendChild(art);

      const main = h('div', { class: 'fui-roster__main' });
      main.appendChild(h('span', { class: 'fui-roster__name', text: row.name }));
      const meta = h('div', { class: 'fui-roster__meta' });
      if (row.stars != null) {
        meta.appendChild(h('span', { class: 'fui-roster__stars', text: '★'.repeat(row.stars) }));
      }
      if (row.level != null) {
        meta.appendChild(
          h('span', {
            class: 'fui-roster__level fui-num',
            text: row.maxLevel ? `Lv ${row.level}/${row.maxLevel}` : `Lv ${row.level}`,
          }),
        );
      }
      if (row.note) meta.appendChild(h('span', { class: 'fui-roster__note', text: row.note }));
      main.appendChild(meta);
      el.appendChild(main);

      if (row.role) {
        el.appendChild(
          h('span', {
            class: 'fui-roster__role',
            style: { '--fui-glyph-src': `var(--fui-img-${row.role})` },
            attrs: { 'aria-hidden': 'true' },
          }),
        );
      }
      if (row.power != null) {
        el.appendChild(
          h(
            'span',
            { class: 'fui-roster__power fui-num', attrs: { title: commas(row.power) } },
            abbreviate(row.power),
          ),
        );
      }
      if (row.locked) {
        el.appendChild(h('span', { class: 'fui-roster__lock', attrs: { 'aria-label': 'Locked' } }));
      }

      if (this.opts.select !== 'none' && !row.disabled) {
        el.addEventListener('click', () => this.select(row.id));
        el.addEventListener('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this.select(row.id);
          }
        });
      }
      this.body.appendChild(el);
    }
    this.paintSelection();
  }

  private paintSelection(): void {
    for (const el of Array.from(this.body.children) as HTMLElement[]) {
      const id = el.dataset.id;
      if (!id) continue;
      const on = this.chosen.has(id);
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
    }
  }
}
