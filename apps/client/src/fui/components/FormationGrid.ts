// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';

export interface FormationUnit {
  id: string;
  name?: string;
  /** Manifest asset id for the portrait. */
  art?: string;
  rarity?: Rarity;
  level?: number;
  /** Glyph asset id for the role pip. */
  role?: string;
}

export interface FormationGridOptions extends BaseOptions {
  /** Rows deep, back to front. Two or three is typical. */
  rows?: number;
  /** Columns wide. */
  cols?: number;
  /** Units keyed by `"row,col"`, e.g. `{ '0,1': unit }`. */
  units?: Record<string, FormationUnit | null>;
  /** Row labels, back row first. */
  rowLabels?: string[];
  /** Cell size in pixels. */
  size?: number;
  /** Let units be dragged between cells. */
  editable?: boolean;
  /** Total power printed under the grid. */
  power?: number;
  /** Mark cells that cannot be filled, as `"row,col"`. */
  blocked?: string[];
}

/**
 * Positional party layout — the front-row / back-row grid a turn-based squad
 * game places its team on, where the cell a unit stands in changes who gets
 * hit first.
 *
 *   const formation = new FormationGrid({
 *     rows: 2, cols: 3,
 *     rowLabels: ['Back', 'Front'],
 *     units: { '1,0': tank, '1,1': bruiser, '0,2': healer },
 *     editable: true,
 *   });
 *   formation.on<Record<string, FormationUnit | null>>('formation:change', save);
 *
 * Distinct from `TeamSlots`, which is an unordered bench: here the coordinates
 * carry meaning, so drag-and-drop swaps two cells rather than reordering a list.
 */
export class FormationGrid extends FuiComponent<FormationGridOptions> {
  private units: Record<string, FormationUnit | null>;
  private board: HTMLElement;
  private dragFrom: string | null = null;

  constructor(opts: FormationGridOptions = {}) {
    const cols = opts.cols ?? 3;
    const root = h('div', {
      class: 'fui fui-formation',
      style: {
        '--fui-form-size': `${opts.size ?? 74}px`,
        '--fui-form-cols': String(cols),
      },
    });
    super(root, opts);
    this.units = { ...(opts.units ?? {}) };

    this.board = h('div', { class: 'fui-formation__board' });
    root.appendChild(this.board);

    if (opts.power != null) {
      root.appendChild(
        h('p', { class: 'fui-formation__power fui-num', text: `Team power ${opts.power.toLocaleString('en-US')}` }),
      );
    }
    this.render();
  }

  private render(): void {
    clear(this.board);
    const rows = this.opts.rows ?? 2;
    const cols = this.opts.cols ?? 3;
    const blocked = new Set(this.opts.blocked ?? []);

    for (let r = 0; r < rows; r++) {
      const line = h('div', { class: 'fui-formation__row' });
      const label = this.opts.rowLabels?.[r];
      if (label) line.appendChild(h('span', { class: 'fui-formation__row-label', text: label }));

      const cells = h('div', { class: 'fui-formation__cells' });
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const unit = this.units[key] ?? null;
        const cell = h('div', {
          class: 'fui-formation__cell',
          dataset: { key, rarity: unit?.rarity ?? 'empty' },
          attrs: { title: unit?.name ?? 'Empty', role: 'gridcell' },
        });
        if (blocked.has(key)) cell.classList.add('is-blocked');
        else if (!unit) cell.classList.add('is-empty');

        if (unit) {
          const art = h('span', { class: 'fui-formation__art' });
          if (unit.art) art.style.backgroundImage = `var(--fui-img-${unit.art})`;
          cell.appendChild(art);
          if (unit.level != null) {
            cell.appendChild(
              h('span', { class: 'fui-formation__level fui-num', text: String(unit.level) }),
            );
          }
          if (unit.role) {
            cell.appendChild(
              h('span', {
                class: 'fui-formation__role',
                style: { '--fui-glyph-src': `var(--fui-img-${unit.role})` },
              }),
            );
          }
          if (unit.name) {
            cell.appendChild(h('span', { class: 'fui-formation__name', text: unit.name }));
          }
        }

        if (this.opts.editable && !blocked.has(key)) this.bindDrag(cell, key);
        cells.appendChild(cell);
      }
      line.appendChild(cells);
      this.board.appendChild(line);
    }
  }

  /** Native HTML5 drag, so a cell can also receive a drop from outside. */
  private bindDrag(cell: HTMLElement, key: string): void {
    cell.draggable = !!this.units[key];
    cell.addEventListener('dragstart', (ev: DragEvent) => {
      this.dragFrom = key;
      ev.dataTransfer?.setData('text/plain', key);
      cell.classList.add('is-dragging');
    });
    cell.addEventListener('dragend', () => {
      this.dragFrom = null;
      cell.classList.remove('is-dragging');
    });
    cell.addEventListener('dragover', (ev: DragEvent) => {
      ev.preventDefault();
      cell.classList.add('is-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-over'));
    cell.addEventListener('drop', (ev: DragEvent) => {
      ev.preventDefault();
      cell.classList.remove('is-over');
      const from = this.dragFrom ?? ev.dataTransfer?.getData('text/plain');
      if (from && from !== key) this.swap(from, key);
    });
    cell.addEventListener('click', () => this.emit('formation:cell', { key, unit: this.units[key] ?? null }));
  }

  /** Exchange the occupants of two cells; either may be empty. */
  swap(a: string, b: string): this {
    const from = this.units[a] ?? null;
    this.units[a] = this.units[b] ?? null;
    this.units[b] = from;
    this.render();
    this.emit('formation:change', this.get());
    return this;
  }

  /** Place (or clear, with `null`) a unit at `"row,col"`. */
  place(key: string, unit: FormationUnit | null): this {
    this.units[key] = unit;
    this.render();
    this.emit('formation:change', this.get());
    return this;
  }

  /** The current layout, keyed by `"row,col"`. Empty cells are omitted. */
  get(): Record<string, FormationUnit> {
    const out: Record<string, FormationUnit> = {};
    for (const [k, v] of Object.entries(this.units)) if (v) out[k] = v;
    return out;
  }
}
