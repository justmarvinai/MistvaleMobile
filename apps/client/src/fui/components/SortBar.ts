// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface SortField {
  /** Value emitted when this field is active. */
  value: string;
  label: string;
  /** Direction used the first time this field is picked. Defaults to `desc`. */
  initial?: 'asc' | 'desc';
}

export interface SortBarOptions extends BaseOptions {
  fields: SortField[];
  /** Field selected first. Defaults to the first entry. */
  value?: string;
  dir?: 'asc' | 'desc';
  /** Show a result count on the right — "128 champions". */
  total?: string;
  size?: 'sm' | 'md';
}

/**
 * The sort strip that sits with a filter bar over any long list: power, level,
 * rarity, speed, acquisition date. Clicking the active field flips its
 * direction, clicking another switches to it.
 *
 *   const sort = new SortBar({
 *     fields: [{ value: 'power', label: 'Power' }, { value: 'level', label: 'Level' }],
 *     total: '128 champions',
 *   });
 *   sort.on<{ field: string; dir: 'asc' | 'desc' }>('sort:change', ({ field, dir }) => list.sort(field, dir));
 */
export class SortBar extends FuiComponent<SortBarOptions> {
  private buttons = new Map<string, HTMLButtonElement>();
  private field: string;
  private dir: 'asc' | 'desc';
  private totalEl: HTMLElement | null = null;

  constructor(opts: SortBarOptions) {
    const root = h('div', { class: 'fui fui-sort', dataset: { size: opts.size ?? 'md' } });
    super(root, opts);

    this.field = opts.value ?? opts.fields[0]?.value ?? '';
    this.dir = opts.dir ?? opts.fields.find((f) => f.value === this.field)?.initial ?? 'desc';

    root.appendChild(h('span', { class: 'fui-sort__label fui-label', text: 'Sort' }));
    for (const f of opts.fields) {
      const btn = h('button', {
        class: 'fui-sort__field',
        attrs: { type: 'button' },
      });
      btn.appendChild(h('span', { text: f.label }));
      btn.appendChild(h('span', { class: 'fui-sort__arrow', attrs: { 'aria-hidden': 'true' } }));
      btn.addEventListener('click', () => this.select(f.value));
      this.buttons.set(f.value, btn);
      root.appendChild(btn);
    }

    if (opts.total != null) {
      this.totalEl = h('span', { class: 'fui-sort__total', text: opts.total });
      root.appendChild(this.totalEl);
    }
    this.paint();
  }

  get(): { field: string; dir: 'asc' | 'desc' } {
    return { field: this.field, dir: this.dir };
  }

  /** Pick a field. Picking the active one flips its direction instead. */
  select(field: string, dir?: 'asc' | 'desc'): this {
    if (!this.buttons.has(field)) return this;
    if (field === this.field && !dir) this.dir = this.dir === 'asc' ? 'desc' : 'asc';
    else {
      this.field = field;
      this.dir = dir ?? this.opts.fields.find((f) => f.value === field)?.initial ?? 'desc';
    }
    this.paint();
    this.emit('sort:change', this.get());
    return this;
  }

  /** Update the result count without touching the selection. */
  setTotal(total: string): this {
    if (this.totalEl) this.totalEl.textContent = total;
    return this;
  }

  private paint(): void {
    for (const [value, btn] of this.buttons) {
      const on = value === this.field;
      btn.classList.toggle('is-on', on);
      btn.dataset.dir = on ? this.dir : '';
      btn.setAttribute('aria-pressed', String(on));
    }
  }
}
